# Requirements Document

## Introduction

This feature replaces manual meal plan inspection with an automated validation and scoring layer. A `validatePlan(plan)` function evaluates generated weekly plans against weighted quality checks (protein variety, same-day diversity, meal balance, cuisine mix, ingredient clashes, etc.) and produces a numeric score. Plans scoring above a configurable threshold are accepted; otherwise the system retries generation up to a maximum number of attempts, tracking the best-scoring plan as a fallback. Precomputed plans for every user preference permutation are stored in DynamoDB and updated only when a higher-scoring plan is produced. Detailed score breakdowns and failed-check logs support debugging.

## Glossary

- **Plan_Validator**: The core module that accepts a WeeklyPlan and returns a ValidationResult containing a numeric score, pass/fail status, and per-check details.
- **Scoring_Engine**: The sub-component within Plan_Validator that computes weighted scores from individual quality checks.
- **Quality_Check**: A single named validation rule (e.g. protein repetition, same-day diversity) that evaluates one aspect of plan quality and returns a pass/fail result with a raw score.
- **Validation_Result**: The output of Plan_Validator containing the total weighted score, pass/fail status, and an array of individual Quality_Check results.
- **Retry_Orchestrator**: The module that coordinates plan generation attempts, tracks the best plan so far, and enforces the maximum retry limit.
- **Precomputed_Plan_Store**: The DynamoDB table and associated repository that stores the best-scoring precomputed plan for each preference permutation.
- **Preference_Permutation**: A unique combination of cuisine (north_indian, south_indian, both), diet (veg, non_veg, both), and style (health, regular) — yielding the full set of user preference combinations.
- **WeeklyPlan**: An array of 7 DayPlan objects (Monday–Sunday), each containing breakfast (Meal), lunch (ComposedMeal), and dinner (ComposedMeal).
- **ComposedMeal**: A meal assembled from four MealComponent categories: base, gravy, dry_veggie, and side.
- **Weight_Config**: A configuration object mapping each Quality_Check name to its numeric weight multiplier.
- **Score_Threshold**: The minimum weighted score a plan must achieve to be accepted.

## Requirements

### Requirement 1: Protein Repetition Check

**User Story:** As a meal planner, I want the system to detect when the same protein source appears on consecutive days, so that weekly plans have good protein variety.

#### Acceptance Criteria

1. WHEN a WeeklyPlan is provided, THE Plan_Validator SHALL identify all instances where the same protein keyIngredient (chicken, egg, fish, paneer) appears in gravy or dry_veggie components on consecutive days.
2. WHEN no protein keyIngredient repeats on consecutive days, THE Quality_Check SHALL return a score of 1.0 (full marks).
3. WHEN one or more consecutive-day protein repetitions exist, THE Quality_Check SHALL return a score proportional to the number of non-repeating day-transitions out of the total day-transitions.
4. THE Scoring_Engine SHALL apply a weight of 3 to the protein repetition Quality_Check score.

### Requirement 2: Same-Day Diversity Check

**User Story:** As a meal planner, I want lunch and dinner on the same day to have different gravies and dry veggies, so that each day feels varied.

#### Acceptance Criteria

1. WHEN a DayPlan is provided, THE Plan_Validator SHALL compare the gravy component of lunch against the gravy component of dinner for that day.
2. WHEN a DayPlan is provided, THE Plan_Validator SHALL compare the dry_veggie component of lunch against the dry_veggie component of dinner for that day.
3. WHEN lunch and dinner share the same gravy component ID or the same dry_veggie component ID, THE Quality_Check SHALL count that day as a same-day diversity violation.
4. THE Quality_Check SHALL return a score equal to the number of days without violations divided by 7.
5. THE Scoring_Engine SHALL apply a weight of 2 to the same-day diversity Quality_Check score.

### Requirement 3: Weekly Dish Frequency Check

**User Story:** As a meal planner, I want no single dish to appear more than twice in a week, so that the plan does not feel repetitive.

#### Acceptance Criteria

1. WHEN a WeeklyPlan is provided, THE Plan_Validator SHALL count the occurrences of each MealComponent ID across all 14 lunch and dinner slots.
2. WHEN any MealComponent ID appears more than 2 times across the week, THE Quality_Check SHALL flag that component as a frequency violation.
3. THE Quality_Check SHALL return a score equal to the number of unique components without frequency violations divided by the total number of unique components used.
4. THE Scoring_Engine SHALL apply a weight of 2 to the weekly dish frequency Quality_Check score.

### Requirement 4: Meal Balance Check

**User Story:** As a meal planner, I want every composed meal to contain all four component categories (base, gravy, dry_veggie, side), so that meals are nutritionally complete.

#### Acceptance Criteria

1. WHEN a ComposedMeal is provided, THE Plan_Validator SHALL verify that the components array contains exactly one component from each of the four categories: base, gravy, dry_veggie, and side.
2. WHEN a ComposedMeal is missing one or more categories, THE Quality_Check SHALL count that meal as a balance violation.
3. THE Quality_Check SHALL return a score equal to the number of balanced meals divided by the total number of composed meals (14 per week).
4. THE Scoring_Engine SHALL apply a weight of 2 to the meal balance Quality_Check score.

### Requirement 5: Minimum Unique Dishes Check

**User Story:** As a meal planner, I want the weekly plan to use a minimum number of unique dishes, so that the plan is not boring.

#### Acceptance Criteria

1. WHEN a WeeklyPlan is provided, THE Plan_Validator SHALL count the total number of distinct MealComponent IDs used across all lunch and dinner slots.
2. THE Plan_Validator SHALL compare the distinct count against a configurable minimum threshold (default: 12).
3. WHEN the distinct count meets or exceeds the threshold, THE Quality_Check SHALL return a score of 1.0.
4. WHEN the distinct count is below the threshold, THE Quality_Check SHALL return a score equal to the distinct count divided by the threshold.
5. THE Scoring_Engine SHALL apply a weight of 1 to the minimum unique dishes Quality_Check score.

### Requirement 6: Cuisine Balance Check

**User Story:** As a meal planner, I want the weekly plan to have a reasonable mix of cuisines when the user prefers both, so that neither cuisine dominates.

#### Acceptance Criteria

1. WHILE the user preference for cuisine is "both", WHEN a WeeklyPlan is provided, THE Plan_Validator SHALL count the number of composed meals where the majority of components are tagged north_indian versus south_indian.
2. THE Quality_Check SHALL return a score of 1.0 when the cuisine split is between 40% and 60% for either cuisine.
3. WHEN the cuisine split falls outside the 40%–60% range, THE Quality_Check SHALL return a score that decreases linearly toward 0.0 as the split approaches 100%–0%.
4. WHILE the user preference for cuisine is a single value (north_indian or south_indian), THE Quality_Check SHALL return a score of 1.0 (check not applicable).
5. THE Scoring_Engine SHALL apply a weight of 1 to the cuisine balance Quality_Check score.

### Requirement 7: Ingredient Clash Check

**User Story:** As a meal planner, I want no two components within the same meal to share signature ingredients, so that each meal has ingredient diversity.

#### Acceptance Criteria

1. WHEN a ComposedMeal is provided, THE Plan_Validator SHALL extract signature ingredients (protein, lentils, vegetables categories) from each component.
2. WHEN two or more components in the same ComposedMeal share a signature ingredient name, THE Quality_Check SHALL count that meal as an ingredient clash violation.
3. WHEN two components in the same ComposedMeal have proteins from different protein groups (e.g. chicken + fish), THE Quality_Check SHALL count that meal as a protein conflict violation.
4. THE Quality_Check SHALL return a score equal to the number of clash-free meals divided by the total number of composed meals (14 per week).
5. THE Scoring_Engine SHALL apply a weight of 1 to the ingredient clash Quality_Check score.

### Requirement 8: Weighted Score Aggregation

**User Story:** As a meal planner, I want individual check scores combined into a single weighted total, so that I can compare plans with one number.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL compute the total score as the sum of (each Quality_Check score × its configured weight) divided by the sum of all configured weights.
2. THE Scoring_Engine SHALL normalize the total score to a value between 0.0 and 1.0.
3. THE Scoring_Engine SHALL read weight values from a Weight_Config object, allowing weights to be changed without code modifications.
4. WHEN a new Quality_Check is added to the Weight_Config, THE Scoring_Engine SHALL include the new check in the aggregation without requiring changes to the aggregation logic.

### Requirement 9: Pass/Fail with Retry

**User Story:** As a meal planner, I want the system to automatically retry plan generation when a plan scores below the threshold, so that users receive the best possible plan.

#### Acceptance Criteria

1. WHEN a generated WeeklyPlan scores at or above the Score_Threshold, THE Retry_Orchestrator SHALL accept the plan and return the Validation_Result.
2. WHEN a generated WeeklyPlan scores below the Score_Threshold, THE Retry_Orchestrator SHALL trigger a new plan generation attempt.
3. THE Retry_Orchestrator SHALL track the highest-scoring plan across all attempts as the "best plan so far".
4. WHEN the maximum number of retry attempts (default: 3) is reached without a passing plan, THE Retry_Orchestrator SHALL return the best plan so far along with its Validation_Result.
5. THE Retry_Orchestrator SHALL accept the Score_Threshold and maximum retry count as configurable parameters.

### Requirement 10: Precomputed Plans in DynamoDB

**User Story:** As a system operator, I want precomputed meal plans stored in DynamoDB for every preference permutation, so that users get instant plan delivery.

#### Acceptance Criteria

1. THE Precomputed_Plan_Store SHALL store one entry per Preference_Permutation, keyed by a composite of cuisine, diet, and style values.
2. WHEN a new plan is generated for a Preference_Permutation, THE Precomputed_Plan_Store SHALL compare the new plan's score against the stored plan's score.
3. WHEN the new plan's score is strictly greater than the stored plan's score, THE Precomputed_Plan_Store SHALL replace the stored plan with the new plan and its score.
4. WHEN the new plan's score is less than or equal to the stored plan's score, THE Precomputed_Plan_Store SHALL retain the existing stored plan.
5. WHEN no plan exists for a Preference_Permutation, THE Precomputed_Plan_Store SHALL store the new plan regardless of its score.
6. THE Precomputed_Plan_Store SHALL store the Validation_Result alongside the WeeklyPlan for each entry.

### Requirement 11: Validation Result Logging

**User Story:** As a developer, I want detailed score breakdowns and failed-check logs for each validated plan, so that I can debug plan quality issues.

#### Acceptance Criteria

1. THE Plan_Validator SHALL include in the Validation_Result the name, weight, raw score, weighted score, and pass/fail status of each Quality_Check.
2. WHEN a Quality_Check fails (score below 1.0), THE Plan_Validator SHALL include a list of specific violations (e.g. which days had protein repetition, which meals had ingredient clashes).
3. THE Retry_Orchestrator SHALL log the Validation_Result for each attempt, including the attempt number and whether the plan was accepted or rejected.
4. THE Retry_Orchestrator SHALL log the final outcome: whether the accepted plan passed the threshold or was the best-of-N fallback.

### Requirement 12: Validate-then-Serialize Round Trip

**User Story:** As a developer, I want to ensure that a WeeklyPlan can be serialized to JSON and deserialized back without changing its validation score, so that storage does not corrupt plan quality data.

#### Acceptance Criteria

1. FOR ALL valid WeeklyPlan objects, serializing to JSON then deserializing back SHALL produce a WeeklyPlan that yields the same Validation_Result score when re-validated.
2. FOR ALL valid Validation_Result objects, serializing to JSON then deserializing back SHALL produce an equivalent Validation_Result with identical check names, scores, and violation details.
