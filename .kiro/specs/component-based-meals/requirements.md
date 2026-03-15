# Requirements Document

## Introduction

The meal planner bot currently treats every meal (breakfast, lunch, dinner) as a single atomic dish (e.g. "Rajma Chawal"). This works for breakfast but limits variety for lunch and dinner, where real home-cooked Indian meals are composed of several components — a base (rice/roti), a gravy or dal, a dry vegetable, and optional sides (curd, raita, salad).

This feature introduces a component-based meal model for lunch and dinner. Individual components are stored separately in a data layer, and the plan generator composes them into full meals at generation time. Breakfast remains unchanged as single-dish meals.

## Glossary

- **Meal_Component**: A single food item belonging to a specific component category (e.g. "Rajma" as a gravy, "Jeera Rice" as a base). Each Meal_Component has an id, name, category, cuisine, diet, style, slots, and ingredients list.
- **Component_Category**: The role a Meal_Component plays in a composed meal. Categories are: `base`, `gravy`, `dry_veggie`, and `side`.
- **Base**: A Component_Category for staple carbohydrates — rice varieties, rotis, pulavs, parathas.
- **Gravy**: A Component_Category for wet dishes — dals, sambars, rasams, curries, kootus, rajma, chana, etc.
- **Dry_Veggie**: A Component_Category for dry-cooked vegetable preparations — bhaji, poriyal, stir-fry, sabzi.
- **Side**: A Component_Category for accompaniments — curd, raita, salad, pickle, papad.
- **Composed_Meal**: A lunch or dinner assembled from one or more Meal_Components selected across Component_Categories. Represented as a collection of Meal_Components rather than a single dish.
- **Plan_Generator**: The module (`src/core/planGenerator.ts`) responsible for building weekly meal plans by selecting meals for each slot.
- **Grocery_List_Generator**: The module (`src/core/groceryListGenerator.ts`) that aggregates ingredients from all meals in a plan into a deduplicated shopping list.
- **Message_Formatter**: The module (`src/messageFormatter.ts`) that renders meal plans and grocery lists into WhatsApp-formatted text.
- **Meal_Repository**: The data access interface (`src/core/ports.ts`) and its JSON implementation that loads meal data from disk.
- **Composition_Rule**: A set of constraints that govern which Meal_Components can be combined into a valid Composed_Meal, based on cuisine, diet, style, and category requirements.

## Requirements

### Requirement 1: Meal Component Data Model

**User Story:** As a developer, I want individual meal components stored with their category, cuisine, diet, style, and ingredients, so that the system can mix and match them into composed meals.

#### Acceptance Criteria

1. THE Meal_Component SHALL have the following properties: id (string), name (string), category (Component_Category), cuisine (`north_indian` or `south_indian`), diet (`veg` or `non_veg`), style (`health` or `regular`), slots (array of `lunch` and/or `dinner`), and ingredients (array of Ingredient objects).
2. THE Component_Category type SHALL consist of exactly four values: `base`, `gravy`, `dry_veggie`, and `side`.
3. WHEN a Meal_Component is created, THE Meal_Component SHALL belong to exactly one Component_Category.
4. THE Meal_Repository SHALL load Meal_Components from a JSON data file (`data/meal-components.json`) separate from the existing `data/meals.json`.

### Requirement 2: Composition Rules for Lunch and Dinner

**User Story:** As a meal planner user, I want lunch and dinner to be composed from compatible components following Indian home-cooking patterns, so that each meal is a realistic, balanced combination.

#### Acceptance Criteria

1. THE Plan_Generator SHALL compose each lunch and dinner Composed_Meal from exactly one base, one gravy, one dry_veggie, and one side.
2. WHEN composing a Composed_Meal, THE Plan_Generator SHALL select Meal_Components that share the same cuisine value.
3. WHEN composing a Composed_Meal, THE Plan_Generator SHALL select Meal_Components that are compatible with the user's diet preference.
4. WHEN composing a Composed_Meal, THE Plan_Generator SHALL select Meal_Components that match the user's style preference.
5. WHEN composing a Composed_Meal, THE Plan_Generator SHALL select Meal_Components whose slots array includes the target slot (`lunch` or `dinner`).

### Requirement 3: Variety in Composed Meals

**User Story:** As a meal planner user, I want the weekly plan to avoid repeating the same components across consecutive days, so that I get maximum variety throughout the week.

#### Acceptance Criteria

1. WHEN generating a weekly plan, THE Plan_Generator SHALL avoid repeating the same gravy Meal_Component within a sliding window of 3 consecutive days.
2. WHEN generating a weekly plan, THE Plan_Generator SHALL avoid repeating the same dry_veggie Meal_Component within a sliding window of 3 consecutive days.
3. WHEN generating a weekly plan, THE Plan_Generator SHALL avoid using the same gravy Meal_Component for both lunch and dinner on the same day.
4. WHEN generating a weekly plan, THE Plan_Generator SHALL avoid key-ingredient overlap between the gravy and dry_veggie selected for the same Composed_Meal.

### Requirement 4: Breakfast Remains Unchanged

**User Story:** As a meal planner user, I want breakfast to continue working as single-dish meals, so that the existing breakfast experience is preserved.

#### Acceptance Criteria

1. THE Plan_Generator SHALL continue to select breakfast as a single Meal from the existing meals data.
2. THE DayPlan type SHALL retain the `breakfast` field as a single Meal.

### Requirement 5: DayPlan Type Update

**User Story:** As a developer, I want the DayPlan type to represent lunch and dinner as composed meals, so that downstream modules can access individual components.

#### Acceptance Criteria

1. THE DayPlan type SHALL represent `lunch` as a Composed_Meal containing an array of Meal_Components.
2. THE DayPlan type SHALL represent `dinner` as a Composed_Meal containing an array of Meal_Components.
3. THE Composed_Meal type SHALL expose a `name` property that concatenates the names of the constituent Meal_Components for display purposes.
4. THE Composed_Meal type SHALL expose an `ingredients` property that aggregates the ingredients from all constituent Meal_Components.

### Requirement 6: Grocery List Generation for Composed Meals

**User Story:** As a meal planner user, I want the grocery list to correctly aggregate ingredients from all components of composed meals, so that I can shop for everything I need.

#### Acceptance Criteria

1. WHEN generating a grocery list, THE Grocery_List_Generator SHALL extract ingredients from each Meal_Component within every Composed_Meal in the plan.
2. WHEN generating a grocery list, THE Grocery_List_Generator SHALL deduplicate ingredients by name (case-insensitive) and combine quantities, consistent with existing behavior.
3. THE Grocery_List_Generator SHALL continue to extract ingredients from single-dish breakfast Meals using the existing logic.

### Requirement 7: Message Formatting for Composed Meals

**User Story:** As a meal planner user, I want the WhatsApp messages to display composed meals in a readable format showing the component names, so that I can see what to cook.

#### Acceptance Criteria

1. WHEN formatting a weekly plan, THE Message_Formatter SHALL display each lunch and dinner Composed_Meal as a comma-separated list of Meal_Component names (e.g. "Rice, Sambar, Beans Poriyal, Curd").
2. WHEN formatting a day plan, THE Message_Formatter SHALL display each lunch and dinner Composed_Meal as a comma-separated list of Meal_Component names.
3. WHEN formatting a cook message, THE Message_Formatter SHALL display each lunch and dinner Composed_Meal as a comma-separated list of Meal_Component names.

### Requirement 8: Swap Lunch for Composed Meals

**User Story:** As a meal planner user, I want to swap tomorrow's lunch and get a different composed meal, so that I have flexibility to change the plan.

#### Acceptance Criteria

1. WHEN the user requests a lunch swap, THE Plan_Generator SHALL replace the entire Composed_Meal for tomorrow's lunch with a newly composed Composed_Meal.
2. WHEN swapping a lunch, THE Plan_Generator SHALL apply the same Composition_Rules (cuisine, diet, style, slot compatibility) as during initial plan generation.
3. WHEN swapping a lunch, THE Plan_Generator SHALL avoid reusing the gravy Meal_Component from the current lunch being swapped.
4. WHEN swapping a lunch, THE Plan_Generator SHALL return the old Composed_Meal name and the new Composed_Meal name for the swap confirmation message.

### Requirement 9: Meal Component Repository

**User Story:** As a developer, I want a repository interface for loading and querying meal components, so that the data access is decoupled from the composition logic.

#### Acceptance Criteria

1. THE Meal_Repository interface SHALL expose a `getComponents(filter)` method that returns Meal_Components matching the given filter criteria (cuisine, diet, style, slot, category).
2. THE JSON implementation of Meal_Repository SHALL load Meal_Components from `data/meal-components.json`.
3. WHEN a filter specifies a Component_Category, THE Meal_Repository SHALL return only Meal_Components belonging to that category.
4. WHEN a filter specifies cuisine as `both`, THE Meal_Repository SHALL return Meal_Components of all cuisines.

### Requirement 10: Backward Compatibility of Serialized Plans

**User Story:** As a developer, I want existing serialized weekly plans (stored in user state) to remain loadable after the type changes, so that users with active plans are not disrupted.

#### Acceptance Criteria

1. WHEN loading a user state that contains a weekly plan with single-dish lunch or dinner Meals, THE system SHALL treat the legacy Meal as a valid plan entry without errors.
2. IF a legacy weekly plan is detected, THEN THE system SHALL prompt the user to regenerate the plan to use the new composed meal format.
