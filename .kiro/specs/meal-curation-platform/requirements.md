# Requirements Document

## Introduction

The Curated Plans feature adds a curation layer on top of the existing SmartMealPlanner WhatsApp bot's algorithmic plan generation. Scripts generate candidate weekly plans, a Curator reviews/edits the JSON files manually, then an upload script pushes approved plans to DynamoDB. The bot serves curated plans first and falls back to the algorithm when exhausted. No web UI — all curation is done via scripts and JSON editing.

## Glossary

- **Candidate_Plan**: A Weekly_Plan generated algorithmically via script, stored as a lightweight JSON file for human review.
- **Approved_Plan**: A Candidate_Plan that has been reviewed, optionally edited, and uploaded to DynamoDB with status "approved".
- **Preference_Combo**: A unique combination of cuisine, diet, and style.
- **Meal_Format**: quick_meal (base+gravy), home_meal (base+gravy+dry_veggie), or full_thali (all four).
- **Curated_Pool**: The set of Approved_Plans in DynamoDB for a given Preference_Combo and Meal_Format that a user has not yet been served.
- **Algorithm_Fallback**: The existing plan generation logic used when the Curated_Pool is exhausted.
- **User_Plan_History**: Per-user tracking of which Approved_Plan IDs have been served, stored on the existing UserState in DynamoDB.

## Requirements

### Requirement 1: Plan Generation Script

**User Story:** As a Curator, I want a script that generates candidate weekly plans for a given Preference_Combo and Meal_Format, so that I have starting points to review.

#### Acceptance Criteria

1. WHEN a Curator runs the generation script with a Preference_Combo and Meal_Format, THE script SHALL produce N candidate plans as lightweight JSON files (IDs + names only, no ingredients).
2. THE generated plans SHALL respect all existing rule engine constraints (same-day dedup, ingredient overlap, cuisine coherence, sliding window variety).
3. THE script SHALL output a human-readable summary of each plan to the console (day → breakfast | lunch | dinner).
4. THE script SHALL save each plan to `data/candidate-plans/{combo}/{planId}.json`.

### Requirement 2: Plan Upload Script

**User Story:** As a Curator, I want a script that uploads reviewed plans to DynamoDB as approved plans, so that the bot can serve them to users.

#### Acceptance Criteria

1. WHEN a Curator runs the upload script pointing to a plan JSON file, THE script SHALL upload the plan to the DynamoDB approved-plans table with status "approved".
2. THE script SHALL resolve component IDs to full meal data (with ingredients) from the existing meal-components and meals data files before uploading.
3. THE script SHALL validate that all component IDs in the plan exist in the data files before uploading, and reject plans with missing IDs.
4. THE script SHALL support uploading all plans in a combo directory at once (batch mode).
5. IF a plan with the same planId already exists in DynamoDB, THE script SHALL skip it and log a warning.

### Requirement 3: DynamoDB Approved Plans Table

**User Story:** As a system operator, I want approved plans stored in DynamoDB, so that the bot can query them at runtime.

#### Acceptance Criteria

1. THE DynamoDB table SHALL store each Approved_Plan with: planId (partition key), combo (cuisine-diet-style), lunchFormat, dinnerFormat, status, createdAt, and the full WeeklyPlan data (with ingredients).
2. THE table SHALL have a GSI on combo + status to support querying all approved plans for a given Preference_Combo.
3. THE table SHALL support querying by combo + lunchFormat + dinnerFormat + status to find plans matching a user's exact preferences.

### Requirement 4: Bot Serves Curated Plans First

**User Story:** As a WhatsApp user, I want to receive a curated plan when available, so that my meal plan has been quality-reviewed by a human.

#### Acceptance Criteria

1. WHEN the bot generates a plan for a user, IT SHALL first query DynamoDB for an Approved_Plan matching the user's Preference_Combo and Meal_Format that the user has not previously been served.
2. WHEN an unseen Approved_Plan exists, THE bot SHALL serve that plan and record the planId in the user's servedPlanIds on their UserState.
3. IF no unseen Approved_Plans exist for the user's combo, THE bot SHALL fall back to the existing Algorithm_Fallback.
4. THE bot SHALL return the plan in the same WeeklyPlan data structure — no changes to downstream formatting, grocery list, or reminder logic.

### Requirement 5: Regenerate Plan from Curated Pool

**User Story:** As a WhatsApp user, I want to regenerate my plan and get the next curated plan if available.

#### Acceptance Criteria

1. WHEN a user regenerates their plan, THE bot SHALL first check for the next unseen Approved_Plan in DynamoDB.
2. IF an unseen Approved_Plan exists, THE bot SHALL serve it and record it in servedPlanIds.
3. IF all Approved_Plans are exhausted, THE bot SHALL fall back to the existing regenerateWeeklyPlan algorithm.

### Requirement 6: Change Meal Alternatives from Curated Plans

**User Story:** As a WhatsApp user, I want meal change alternatives to come from curated plans first.

#### Acceptance Criteria

1. WHEN a user requests to change a meal, THE bot SHALL first collect alternative meals for that slot from other Approved_Plans in DynamoDB matching the user's combo.
2. WHEN curated alternatives exist, THE bot SHALL present them (up to 3).
3. IF no curated alternatives remain, THE bot SHALL fall back to the existing generateAlternatives algorithm.
4. User selection always takes priority — the chosen meal replaces the current one regardless of source.

### Requirement 7: User Plan History on UserState

**User Story:** As a system operator, I want per-user tracking of served curated plans, so the system knows when to fall back to the algorithm.

#### Acceptance Criteria

1. THE UserState in DynamoDB SHALL include a new field `servedPlanIds` — an array of Approved_Plan IDs that have been served to this user.
2. WHEN an Approved_Plan is served, THE bot SHALL append its planId to servedPlanIds.
3. THE bot SHALL use servedPlanIds to exclude already-served plans when querying the Curated_Pool.
4. IF a user changes their Preference_Combo, THE bot SHALL NOT reset servedPlanIds — plans from the old combo are irrelevant to the new combo's query.
