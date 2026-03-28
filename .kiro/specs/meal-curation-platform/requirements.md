# Requirements Document

## Introduction

The Meal Curation Platform adds a curation layer on top of the existing SmartMealPlanner WhatsApp bot's algorithmic plan generation. The existing algorithm continues to generate plans as before, but a new curation workflow allows Curators to review, edit, and approve those generated plans via a web UI before they are served to users. Approved plans are stored in DynamoDB and served as the primary source for WhatsApp users. When a user requests a plan, changes a meal, or regenerates their plan, the system first attempts to serve from the pool of pre-approved curated plans. The existing algorithm acts as a fallback when all curated options for a user's Preference_Combo are exhausted. The platform targets developers, product managers, and nutritionists who need to manage meal components and curate weekly plans across all 36 preference combinations (3 cuisines × 2 diets × 2 styles × 3 meal formats).

## Glossary

- **Curation_Platform**: The web-based management UI and its supporting backend API for browsing, editing, approving, and managing meal plans and meal components.
- **Meal_Component**: A single food item belonging to one of four categories (base, gravy, dry_veggie, side) used to compose lunch and dinner meals. Stored with id, name, category, cuisine, diet, style, slots, ingredients, and optional keyIngredient.
- **Breakfast_Meal**: A standalone meal item used for the breakfast slot. Stored with id, name, cuisine, diet, style, slots, and ingredients.
- **Composed_Meal**: A lunch or dinner meal assembled from multiple Meal_Components according to a Meal_Format (e.g., quick_meal = base + gravy).
- **Weekly_Plan**: A 7-day plan (Monday–Sunday) where each day has a breakfast, lunch (Composed_Meal), and dinner (Composed_Meal).
- **Candidate_Plan**: A Weekly_Plan generated algorithmically that is pending human review and has status "candidate".
- **Approved_Plan**: A Weekly_Plan that has been reviewed, optionally edited, and marked as approved for serving to WhatsApp users.
- **Preference_Combo**: A unique combination of cuisine (north_indian, south_indian, both), diet (veg, non_veg), and style (health, regular) that determines which Meal_Components and Breakfast_Meals are eligible for a plan.
- **Meal_Format**: The composition rule for lunch/dinner: quick_meal (base + gravy), home_meal (base + gravy + dry_veggie), or full_thali (base + gravy + dry_veggie + side).
- **Plan_Status**: The lifecycle state of a Weekly_Plan: candidate, approved, or archived.
- **Curator**: A developer, product manager, or nutritionist who uses the Curation_Platform to manage meal data and curate plans.
- **Component_Category**: One of four categories a Meal_Component belongs to: base, gravy, dry_veggie, or side.
- **DynamoDB_Store**: The Amazon DynamoDB tables used to persist Meal_Components, Breakfast_Meals, and Weekly_Plans.
- **Management_API**: The set of API Gateway + Lambda endpoints that the Curation_Platform UI calls to perform CRUD and workflow operations.
- **User_Plan_History**: A per-user record in the DynamoDB_Store that tracks which Approved_Plans and individual curated meals have already been served to a specific WhatsApp user for a given Preference_Combo and Meal_Format.
- **Curated_Pool**: The set of Approved_Plans for a given Preference_Combo and Meal_Format that a specific user has not yet been served, as determined by the User_Plan_History.
- **Algorithm_Fallback**: The existing algorithmic plan generation logic (rules engine, meal selector, plan generator) used when the Curated_Pool is exhausted for a user.

## Requirements

### Requirement 1: Meal Component Management

**User Story:** As a Curator, I want to create, read, update, and delete Meal_Components through the Curation_Platform, so that I can maintain an up-to-date pool of ingredients for plan composition.

#### Acceptance Criteria

1. THE Curation_Platform SHALL display a browsable list of all Meal_Components, filterable by cuisine, diet, style, and Component_Category.
2. WHEN a Curator submits a new Meal_Component with valid fields (id, name, category, cuisine, diet, style, slots, ingredients), THE Management_API SHALL persist the Meal_Component to the DynamoDB_Store and return the created record.
3. WHEN a Curator updates an existing Meal_Component, THE Management_API SHALL persist the updated fields to the DynamoDB_Store and return the updated record.
4. WHEN a Curator deletes a Meal_Component, THE Management_API SHALL remove the Meal_Component from the DynamoDB_Store.
5. IF a Curator submits a Meal_Component with missing required fields, THEN THE Management_API SHALL return a validation error specifying the missing fields.
6. THE Curation_Platform SHALL display each Meal_Component with its name, category, cuisine tags, diet, style, slot assignments, and ingredient list.

### Requirement 2: Breakfast Meal Management

**User Story:** As a Curator, I want to create, read, update, and delete Breakfast_Meals through the Curation_Platform, so that I can maintain the pool of breakfast options available for weekly plans.

#### Acceptance Criteria

1. THE Curation_Platform SHALL display a browsable list of all Breakfast_Meals, filterable by cuisine, diet, and style.
2. WHEN a Curator submits a new Breakfast_Meal with valid fields (id, name, cuisine, diet, style, slots, ingredients), THE Management_API SHALL persist the Breakfast_Meal to the DynamoDB_Store and return the created record.
3. WHEN a Curator updates an existing Breakfast_Meal, THE Management_API SHALL persist the updated fields to the DynamoDB_Store and return the updated record.
4. WHEN a Curator deletes a Breakfast_Meal, THE Management_API SHALL remove the Breakfast_Meal from the DynamoDB_Store.
5. IF a Curator submits a Breakfast_Meal with missing required fields, THEN THE Management_API SHALL return a validation error specifying the missing fields.

### Requirement 3: Candidate Plan Generation

**User Story:** As a Curator, I want to generate candidate weekly plans for a given Preference_Combo and Meal_Format, so that I have algorithmically produced starting points to review and refine.

#### Acceptance Criteria

1. WHEN a Curator selects a Preference_Combo and Meal_Format pair and requests plan generation, THE Curation_Platform SHALL invoke the existing plan generation algorithm (rules engine, meal selector, plan generator) to produce one or more Candidate_Plans.
2. THE generated Candidate_Plans SHALL respect all existing rule engine constraints (cuisine filtering, diet filtering, style filtering, same-day dedup, ingredient overlap, cuisine alternation, sliding window variety).
3. THE Management_API SHALL persist each generated Candidate_Plan to the DynamoDB_Store with Plan_Status set to "candidate" and a creation timestamp.
4. THE Curation_Platform SHALL display each generated Candidate_Plan as a 7-day grid showing breakfast name, lunch component names, and dinner component names for each day.
5. WHEN generating a Candidate_Plan, THE Curation_Platform SHALL use only Meal_Components and Breakfast_Meals that match the selected Preference_Combo from the DynamoDB_Store.

### Requirement 4: Plan Review and Editing

**User Story:** As a Curator, I want to review and edit a Candidate_Plan by reassigning meals and components to specific days and slots, so that I can fine-tune plans before approving them.

#### Acceptance Criteria

1. THE Curation_Platform SHALL display a Candidate_Plan in an editable 7-day grid where each cell shows the assigned breakfast, lunch components, or dinner components.
2. WHEN a Curator assigns a different Breakfast_Meal to a day, THE Curation_Platform SHALL update that day's breakfast in the plan and display the change.
3. WHEN a Curator assigns a different Meal_Component to a specific category slot (base, gravy, dry_veggie, side) within a day's lunch or dinner, THE Curation_Platform SHALL update that component in the Composed_Meal and display the change.
4. THE Curation_Platform SHALL present only Meal_Components and Breakfast_Meals compatible with the plan's Preference_Combo and Meal_Format as assignment options.
5. WHEN a Curator saves edits to a plan, THE Management_API SHALL persist the updated plan to the DynamoDB_Store.
6. WHEN a Curator manually overrides a meal assignment that would violate a rule engine constraint (e.g., same-day dedup, ingredient overlap), THE Curation_Platform SHALL accept the override — human editorial decisions take priority over algorithmic constraints.
7. THE Curation_Platform SHALL visually flag any rule engine constraint violations in the edited plan (e.g., highlight repeated ingredients on the same day) as warnings, but SHALL NOT block the Curator from saving.

### Requirement 5: Plan Approval Workflow

**User Story:** As a Curator, I want to approve or archive plans, so that only reviewed plans are served to WhatsApp users and outdated plans are retired.

#### Acceptance Criteria

1. WHEN a Curator approves a Candidate_Plan, THE Management_API SHALL update the plan's Plan_Status to "approved" in the DynamoDB_Store and record an approval timestamp.
2. WHEN a Curator archives a plan (candidate or approved), THE Management_API SHALL update the plan's Plan_Status to "archived" in the DynamoDB_Store.
3. THE Curation_Platform SHALL display plans grouped or filterable by Plan_Status (candidate, approved, archived).
4. THE Curation_Platform SHALL visually distinguish plans by their Plan_Status using color coding or status badges.

### Requirement 6: Serving Approved Plans to WhatsApp Users (Layered Approach)

**User Story:** As a Curator, I want approved plans to be the primary source for WhatsApp users, with the existing algorithm as a fallback, so that users receive curated meal plans whenever available.

#### Acceptance Criteria

1. WHEN the WhatsApp bot receives a plan request for a given Preference_Combo and Meal_Format, THE bot SHALL first query the DynamoDB_Store for an Approved_Plan in the Curated_Pool that the user has not previously been served.
2. WHEN an unseen Approved_Plan exists in the Curated_Pool, THE bot SHALL serve that plan to the user and record it in the User_Plan_History.
3. IF the Curated_Pool is empty for the user's Preference_Combo and Meal_Format (all approved plans exhausted), THEN THE bot SHALL fall back to the Algorithm_Fallback to generate a plan on the fly using the existing rules engine.
4. THE bot SHALL return the selected plan in the same WeeklyPlan data structure used by the existing bot, including full ingredient details resolved from the DynamoDB_Store.
5. THE bot SHALL select from the Curated_Pool without repeating a previously served Approved_Plan for the same user until all Approved_Plans for that combination have been exhausted.
6. AFTER a plan is served (curated or algorithmic), THE user SHALL still be able to modify individual meals via the existing change-meal flow — user modifications always take priority.

### Requirement 11: Change Meal from Curated Alternatives

**User Story:** As a WhatsApp user, I want to change individual meals in my plan and receive curated alternatives first, so that my replacements are also quality-reviewed whenever possible.

#### Acceptance Criteria

1. WHEN a user requests to change a specific meal (breakfast, lunch, or dinner) for a given day, THE bot SHALL first look for alternative meals from other Approved_Plans in the DynamoDB_Store that match the user's Preference_Combo and Meal_Format.
2. WHEN curated alternatives are available, THE bot SHALL present those alternatives to the user for selection.
3. IF no curated alternatives remain for the requested slot and Preference_Combo, THEN THE bot SHALL fall back to the Algorithm_Fallback (existing generateAlternatives) to produce alternatives.
4. WHEN a user selects any alternative (curated or algorithmic), THE bot SHALL update the user's current Weekly_Plan with the selected meal — user choice always takes priority.
5. THE bot SHALL track which individual curated meals have been offered to the user in the User_Plan_History to avoid repeating the same alternatives.

### Requirement 12: Regenerate Plan from Curated Pool

**User Story:** As a WhatsApp user, I want to regenerate my entire weekly plan and receive the next curated plan first, so that I get a fresh quality-reviewed plan whenever possible.

#### Acceptance Criteria

1. WHEN a user requests to regenerate their entire Weekly_Plan, THE bot SHALL first query the DynamoDB_Store for the next unseen Approved_Plan matching the user's Preference_Combo and Meal_Format.
2. WHEN an unseen Approved_Plan exists, THE bot SHALL serve that plan as the user's new Weekly_Plan and record it in the User_Plan_History.
3. IF all Approved_Plans for the user's Preference_Combo and Meal_Format have been previously served, THEN THE bot SHALL fall back to the Algorithm_Fallback (existing regenerateWeeklyPlan) to generate a new plan.
4. THE bot SHALL return the regenerated plan in the same WeeklyPlan data structure used by the existing bot.
5. AFTER regeneration, THE user SHALL still be able to modify individual meals — user modifications always take priority over the curated plan.

### Requirement 13: User Plan History Tracking

**User Story:** As a system operator, I want the platform to track which curated plans and meals each user has been served, so that the system avoids repeating curated content and knows when to fall back to the algorithm.

#### Acceptance Criteria

1. THE DynamoDB_Store SHALL maintain a User_Plan_History record for each WhatsApp user, keyed by phone number.
2. WHEN an Approved_Plan is served to a user (initial serve or regeneration), THE Management_API SHALL append the plan id to the user's User_Plan_History for that Preference_Combo and Meal_Format.
3. WHEN individual curated meals are offered as change-meal alternatives, THE Management_API SHALL record the offered meal identifiers in the User_Plan_History.
4. THE Management_API SHALL use the User_Plan_History to determine the Curated_Pool (Approved_Plans minus previously served plans) for each user request.
5. IF a user changes their Preference_Combo, THEN THE Management_API SHALL treat the new combination as a fresh Curated_Pool with no prior history for that combination.

### Requirement 7: Management API

**User Story:** As a Curator, I want a RESTful API backing the Curation_Platform, so that all operations are performed through a consistent, secure interface.

#### Acceptance Criteria

1. THE Management_API SHALL expose CRUD endpoints for Meal_Components at the path /api/components.
2. THE Management_API SHALL expose CRUD endpoints for Breakfast_Meals at the path /api/meals.
3. THE Management_API SHALL expose endpoints for plan operations (generate, list, get, update, approve, archive) at the path /api/plans.
4. THE Management_API SHALL be deployed as Lambda functions behind API Gateway, consistent with the existing SmartMealPlanner infrastructure pattern.
5. IF a request to the Management_API contains an invalid or malformed payload, THEN THE Management_API SHALL return an HTTP 400 response with a descriptive error message.
6. IF a request references a resource that does not exist, THEN THE Management_API SHALL return an HTTP 404 response.

### Requirement 8: DynamoDB Data Storage

**User Story:** As a Curator, I want all meal data and plans stored in DynamoDB, so that the platform has a reliable, scalable data store consistent with the existing infrastructure.

#### Acceptance Criteria

1. THE DynamoDB_Store SHALL store Meal_Components with partition key based on component id, supporting queries by cuisine, diet, style, and Component_Category.
2. THE DynamoDB_Store SHALL store Breakfast_Meals with partition key based on meal id, supporting queries by cuisine, diet, and style.
3. THE DynamoDB_Store SHALL store Weekly_Plans with partition key based on plan id, supporting queries by Preference_Combo, Meal_Format, and Plan_Status.
4. WHEN a Meal_Component or Breakfast_Meal is created or updated, THE DynamoDB_Store SHALL persist the complete record including all ingredients.
5. THE DynamoDB_Store SHALL support querying all Approved_Plans for a given Preference_Combo and Meal_Format combination.
6. THE DynamoDB_Store SHALL store User_Plan_History records keyed by user phone number, supporting queries by Preference_Combo and Meal_Format to retrieve the list of previously served plan ids and meal identifiers.

### Requirement 9: Curation Platform Web UI

**User Story:** As a Curator, I want a web-based interface to manage meal components and curate plans, so that I do not need to edit JSON files or run scripts manually.

#### Acceptance Criteria

1. THE Curation_Platform SHALL provide a navigation structure with sections for Meal_Components, Breakfast_Meals, and Weekly_Plans.
2. THE Curation_Platform SHALL render the Weekly_Plan editor as a 7-day grid (rows = days Monday–Sunday, columns = breakfast, lunch, dinner).
3. WHEN a Curator clicks on a meal slot in the plan grid, THE Curation_Platform SHALL display a picker showing compatible options that the Curator can select to assign.
4. THE Curation_Platform SHALL display the Preference_Combo and Meal_Format of each plan prominently in the plan view.
5. THE Curation_Platform SHALL be served as a static single-page application hosted alongside the existing infrastructure.

### Requirement 10: Data Migration from JSON Files

**User Story:** As a Curator, I want existing meal data from JSON files to be importable into DynamoDB, so that the current meal pool is available in the new platform from day one.

#### Acceptance Criteria

1. WHEN a data migration is executed, THE Curation_Platform SHALL import all Breakfast_Meals from the existing meals.json file into the DynamoDB_Store.
2. WHEN a data migration is executed, THE Curation_Platform SHALL import all Meal_Components from the existing meal-components/ directory JSON files into the DynamoDB_Store.
3. WHEN a data migration is executed, THE Curation_Platform SHALL import all existing Candidate_Plans from the candidate-plans/ directory into the DynamoDB_Store with their original Plan_Status preserved.
4. IF a record with the same id already exists during migration, THEN THE Curation_Platform SHALL skip the duplicate and log a warning.
