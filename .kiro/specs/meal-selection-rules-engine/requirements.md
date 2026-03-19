# Requirements Document

## Introduction

This feature externalizes the meal selection logic from hardcoded TypeScript into a human-readable JSON rules file. The goal is to allow non-technical users (nutritionists, meal planners, product managers) to understand, review, and maintain the meal selection guardrails without touching code. A lightweight rules engine evaluates these rules at runtime against meal and meal component data from `meals.json` and `meal-components.json`.

Currently, selection constraints (variety, ingredient overlap avoidance, cuisine alternation, diet fallback, style fallback, sliding-window history) are embedded across `planGenerator.ts` and `dishPreview.ts`. This feature extracts those constraints into a declarative rules file and introduces a rules engine that interprets them.

## Glossary

- **Rules_File**: A JSON file (`data/meal-selection-rules.json`) containing human-readable rule definitions that govern meal selection behavior
- **Rules_Engine**: A TypeScript module that loads, validates, and evaluates rules from the Rules_File against meal and meal component data
- **Rule**: A single named entry in the Rules_File consisting of a human-readable description, a scope (which meals/components it applies to), conditions, and an action (filter, prefer, reject, constrain)
- **Meal_Selector**: The system component that uses the Rules_Engine to filter and select meals and meal components for plan generation
- **Plan_Generator**: The existing module (`planGenerator.ts`) that assembles weekly meal plans from selected meals and components
- **Dish_Preview**: The existing module (`dishPreview.ts`) that generates candidate dish pools for user preview
- **Meal**: A breakfast item from `meals.json` with properties: id, name, cuisine, diet, style, slots, ingredients
- **Meal_Component**: A lunch/dinner component from `meal-components.json` with properties: id, name, category, cuisine, diet, style, slots, ingredients
- **Component_Category**: One of: base, gravy, dry_veggie, side
- **Sliding_Window**: A constraint that tracks recently used items over a configurable number of days to prevent repetition
- **Same_Day_Constraint**: A constraint that prevents the same component from appearing in both lunch and dinner on the same day
- **Ingredient_Overlap_Constraint**: A constraint that prevents two components in the same meal from sharing key ingredients
- **Cuisine_Alternation**: A rule that alternates between north_indian and south_indian cuisines across days when user preference is "both"
- **South_Indian_Crossover_Whitelist**: A curated list of popular South Indian dishes (e.g., Idli, Dosa, Uttapam, Sambhar) that are included when the user's cuisine preference is "both"; traditional South Indian dishes not on this list are excluded in "both" mode
- **Diet_Fallback**: A rule that includes veg components for non_veg users to expand the pool
- **Style_Fallback**: A rule that includes regular-style components (with a suffix label) when health-style options in a category are fewer than a threshold

## Requirements

### Requirement 1: Rules File Schema and Structure

**User Story:** As a meal planner (non-coder), I want meal selection guardrails written as named, descriptive rules in a JSON file, so that I can read and understand what constraints govern meal selection without reading code.

#### Acceptance Criteria

1. THE Rules_File SHALL contain an array of Rule objects, where each Rule has the fields: `id` (unique string), `name` (human-readable label), `description` (verbose plain-English explanation of what the rule does and why), `scope` (what the rule applies to), `conditions` (when the rule activates), and `action` (what the rule does)
2. THE Rules_File SHALL be valid JSON that conforms to a documented JSON schema
3. WHEN a Rule's `description` field is read by a non-technical person, THE Rules_File SHALL convey the rule's purpose without requiring programming knowledge
4. THE Rules_File SHALL support the following action types: `filter` (include/exclude items from a pool), `prefer` (prioritize items without excluding others), `constrain` (enforce a relationship between selected items), and `limit` (cap repetition over a window)
5. THE Rules_File SHALL support scope values that target: `breakfast`, `lunch_component`, `dinner_component`, or `all_slots`
6. WHEN a Rule targets lunch or dinner components, THE Rules_File SHALL allow scoping to specific Component_Category values (base, gravy, dry_veggie, side)

### Requirement 2: Rules Engine Loading and Validation

**User Story:** As a developer, I want the rules engine to load and validate the rules file at startup, so that malformed or conflicting rules are caught early rather than at meal selection time.

#### Acceptance Criteria

1. WHEN the application starts, THE Rules_Engine SHALL load the Rules_File from the configured file path
2. WHEN the Rules_File contains a Rule with a missing or empty `id`, `name`, `description`, or `action` field, THE Rules_Engine SHALL reject the file and report the specific validation error
3. WHEN the Rules_File contains two Rules with the same `id`, THE Rules_Engine SHALL reject the file and report the duplicate ID
4. WHEN the Rules_File is not valid JSON, THE Rules_Engine SHALL reject the file and report a parse error with the file path
5. WHEN the Rules_File is valid and all Rules pass validation, THE Rules_Engine SHALL make the rules available for evaluation
6. IF the Rules_File does not exist at the configured path, THEN THE Rules_Engine SHALL report a descriptive file-not-found error

### Requirement 3: Rule Evaluation for Meal Filtering

**User Story:** As a meal planner, I want rules that filter meals based on user preferences (cuisine, diet, style), so that users only see meals matching their selections.

#### Acceptance Criteria

1. WHEN a `filter` rule with cuisine conditions is evaluated against a Meal or Meal_Component, THE Rules_Engine SHALL include only items whose cuisine matches the user's preference, or include all cuisines when the preference is "both"
2. WHEN a `filter` rule with diet conditions is evaluated, THE Rules_Engine SHALL include only items whose diet matches the user's preference, or include all diets when the preference is "both"
3. WHEN a `filter` rule with style conditions is evaluated, THE Rules_Engine SHALL include only items whose style matches the user's preference
4. WHEN a `filter` rule with slot conditions is evaluated, THE Rules_Engine SHALL include only items whose slots array contains the target slot
5. WHEN multiple filter rules apply to the same pool, THE Rules_Engine SHALL apply all filters in sequence (intersection semantics)

### Requirement 4: Diet Fallback Rule

**User Story:** As a meal planner, I want a rule that automatically includes vegetarian components for non-vegetarian users, so that non-veg users have a wider variety of meal components to choose from.

#### Acceptance Criteria

1. WHEN the user's diet preference is "non_veg" and a diet fallback rule is active, THE Rules_Engine SHALL include both non_veg and veg Meal_Components in the candidate pool
2. WHEN the user's diet preference is "veg", THE Rules_Engine SHALL include only veg Meal_Components regardless of the diet fallback rule
3. THE Rules_File SHALL express the diet fallback rule with a description that a non-coder can understand, such as: "Non-vegetarian users also see all vegetarian dishes to give them more variety"

### Requirement 5: Style Fallback Rule

**User Story:** As a meal planner, I want a rule that supplements health-style options with regular-style options when health choices are limited, so that users always have enough variety in each component category.

#### Acceptance Criteria

1. WHEN the user's style preference is "health" and a Component_Category has fewer available health-style components than a configurable threshold, THE Rules_Engine SHALL include regular-style components from the same category as fallback options
2. WHEN regular-style components are included as fallback, THE Meal_Selector SHALL append a label suffix (e.g., "(Regular)") to the component name to distinguish fallback items from health items
3. THE Rules_File SHALL express the style fallback threshold as a readable parameter in the rule definition, such as: `"threshold": 2`
4. WHEN the user's style preference is "regular", THE Rules_Engine SHALL not apply the style fallback rule

### Requirement 6: Variety Constraints — Sliding Window

**User Story:** As a meal planner, I want a rule that prevents the same dish or component from repeating within a configurable number of days, so that weekly plans have good variety.

#### Acceptance Criteria

1. WHEN a `limit` rule with a sliding window is evaluated, THE Rules_Engine SHALL track recently selected item IDs per slot and per Component_Category over the configured window size
2. WHEN an item's ID appears in the sliding window for its slot and category, THE Rules_Engine SHALL deprioritize that item during selection
3. THE Rules_File SHALL express the window size as a readable parameter, such as: `"windowSize": 3`
4. WHEN all available items in a category are within the sliding window, THE Rules_Engine SHALL relax the constraint and allow selection from the full pool (progressive relaxation)

### Requirement 7: Same-Day Deduplication Constraint

**User Story:** As a meal planner, I want a rule that prevents the same component from appearing in both lunch and dinner on the same day, so that each day's meals feel distinct.

#### Acceptance Criteria

1. WHEN a `constrain` rule for same-day deduplication is active and a component has been selected for lunch, THE Rules_Engine SHALL exclude that component's ID from the dinner selection pool for the same day
2. WHEN all available components in a dinner category have been used at lunch, THE Rules_Engine SHALL relax the same-day constraint and allow reuse (progressive relaxation)
3. THE Rules_File SHALL express this rule with a description such as: "The same dish component should not appear in both lunch and dinner on the same day"

### Requirement 8: Ingredient Overlap Avoidance

**User Story:** As a meal planner, I want a rule that prevents two components in the same composed meal from sharing key ingredients (e.g., two chicken dishes), so that meals have ingredient diversity.

#### Acceptance Criteria

1. WHEN a `constrain` rule for ingredient overlap is active, THE Rules_Engine SHALL check that the gravy component does not share key ingredients with the selected base component
2. WHEN a `constrain` rule for ingredient overlap is active, THE Rules_Engine SHALL check that the dry_veggie component does not share key ingredients with the selected gravy component
3. THE Rules_File SHALL define which ingredient keywords are considered "key ingredients" (e.g., chicken, egg, fish, paneer, cauliflower, spinach, okra) as a readable list within the rule
4. WHEN no component can be found that avoids ingredient overlap, THE Rules_Engine SHALL relax the constraint and select the next available component (progressive relaxation)

### Requirement 9: Cuisine Alternation Rule

**User Story:** As a meal planner, I want a rule that alternates between North Indian and South Indian cuisines across days when the user prefers "both", so that the weekly plan has balanced cuisine representation.

#### Acceptance Criteria

1. WHEN the user's cuisine preference is "both" and a cuisine alternation rule is active, THE Rules_Engine SHALL assign alternating cuisines to consecutive days (e.g., day 0 = north_indian, day 1 = south_indian)
2. WHEN the user's cuisine preference is a single cuisine, THE Rules_Engine SHALL assign that cuisine to all days regardless of the alternation rule
3. THE Rules_File SHALL express the alternation pattern as a readable parameter, such as: `"pattern": "alternate_by_day"`

### Requirement 10: Excluded Dishes Rule

**User Story:** As a meal planner, I want a rule that removes user-excluded dishes from all candidate pools, so that dishes the user has rejected during preview never reappear.

#### Acceptance Criteria

1. WHEN a `filter` rule for excluded dishes is evaluated and the user has an exclusion list, THE Rules_Engine SHALL remove all Meals and Meal_Components whose IDs appear in the exclusion list from every candidate pool
2. WHEN the exclusion list is empty, THE Rules_Engine SHALL not remove any items from the candidate pools
3. THE Rules_File SHALL express this rule with a description such as: "Dishes that the user has previously removed are excluded from all future selections"

### Requirement 11: Rules File Parsing and Pretty-Printing

**User Story:** As a developer, I want to parse the rules file into typed objects and print typed objects back to valid JSON, so that rules can be programmatically read, modified, and written back.

#### Acceptance Criteria

1. THE Rules_Engine SHALL parse the Rules_File JSON into strongly-typed TypeScript Rule objects
2. THE Rules_Engine SHALL provide a function to serialize typed Rule objects back into formatted JSON
3. FOR ALL valid Rules_File contents, parsing then serializing then parsing SHALL produce an equivalent set of Rule objects (round-trip property)

### Requirement 12: Backward Compatibility with Existing Plan Generation

**User Story:** As a developer, I want the rules engine to produce the same selection behavior as the current hardcoded logic when loaded with the default rules file, so that existing users experience no change.

#### Acceptance Criteria

1. WHEN the default Rules_File is loaded (shipped with the application), THE Meal_Selector SHALL produce candidate pools equivalent to those produced by the current `generateCandidateDishes` function for the same user preferences and exclusion list
2. WHEN the default Rules_File is loaded, THE Plan_Generator SHALL produce weekly plans with the same variety constraints (sliding window, same-day dedup, ingredient overlap) as the current `generateWeeklyPlan` and `composeMeal` functions
3. THE Rules_File shipped with the application SHALL contain rules that encode all current hardcoded constraints from `planGenerator.ts` and `dishPreview.ts`

### Requirement 13: Integration with Existing Ports and Adapters

**User Story:** As a developer, I want the rules engine to integrate through the existing port/adapter architecture, so that the rules file is loaded via a repository interface and the core logic remains adapter-agnostic.

#### Acceptance Criteria

1. THE Rules_Engine SHALL access the Rules_File through a `RulesRepository` port interface defined in `ports.ts`
2. THE Meal_Selector SHALL accept a `RulesRepository` dependency via constructor or function parameter injection
3. WHEN a new adapter for the Rules_File is implemented (e.g., reading from a database instead of a JSON file), THE Rules_Engine SHALL function without changes to core logic


### Requirement 14: South Indian Crossover Filtering for "Both" Cuisine Preference

**User Story:** As a meal planner, I want a rule that limits South Indian dishes to a curated whitelist of popular crossover items when the user prefers "both" cuisines, so that the plan includes all North Indian dishes but only familiar, widely-accepted South Indian dishes rather than the full traditional South Indian catalog.

#### Acceptance Criteria

1. WHEN the user's cuisine preference is "both" and a South Indian crossover filter rule is active, THE Rules_Engine SHALL include all North Indian Meals and Meal_Components without restriction
2. WHEN the user's cuisine preference is "both" and a South Indian crossover filter rule is active, THE Rules_Engine SHALL include only South Indian Meals and Meal_Components whose names or IDs appear in the South_Indian_Crossover_Whitelist
3. THE Rules_File SHALL define the South_Indian_Crossover_Whitelist as a readable list of dish names within the rule, including at minimum: Idli, Dosa, Uttapam, Sambhar, and their variants (e.g., Rava Dosa, Masala Dosa, Idli with Sambar)
4. WHEN the user's cuisine preference is "south_indian" (single cuisine), THE Rules_Engine SHALL include all South Indian Meals and Meal_Components without applying the crossover whitelist filter
5. WHEN the user's cuisine preference is "north_indian" (single cuisine), THE Rules_Engine SHALL not apply the South Indian crossover filter rule
6. THE Rules_File SHALL express this rule with a description such as: "When the user likes both cuisines, include all North Indian dishes but only popular South Indian crossover dishes like Idli, Dosa, Uttapam, and Sambhar — not the full traditional South Indian menu"
7. THE Rules_File SHALL allow the South_Indian_Crossover_Whitelist to be edited by a meal planner without code changes, by adding or removing dish names from the list in the rule definition
