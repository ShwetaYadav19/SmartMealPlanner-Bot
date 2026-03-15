# Requirements Document

## Introduction

This feature changes the dish preview flow for lunches and dinners from a composed-meal level to a component level. Currently, the dish preview shows fully composed meals (e.g., "Steamed Rice, Sambar, Beans Poriyal, Curd") and lets users remove entire meals. However, removing a composed meal does not prevent its individual components from being recombined into new meals, causing unwanted items to reappear. This feature replaces the composed-meal preview with a component-level preview where users can exclude individual MealComponents (base, gravy, dry_veggie, side). After the user confirms their component selections, the system composes meals from the remaining non-excluded components.

## Glossary

- **Bot**: The WhatsApp-based SmartMealPlanner chatbot that processes user messages and returns meal planning responses
- **User**: A person interacting with the Bot via WhatsApp
- **Dish_Preview**: The preview screen shown to the User before weekly plan generation, listing candidate items the User can remove
- **MealComponent**: An individual food item belonging to one of four categories (base, gravy, dry_veggie, side) used to compose lunches and dinners
- **ComponentCategory**: One of four categories a MealComponent belongs to: base, gravy, dry_veggie, or side
- **ComposedMeal**: A lunch or dinner assembled from four MealComponents (one per ComponentCategory)
- **Component_Preview**: The new component-level preview that lists individual MealComponents grouped by ComponentCategory, replacing the old composed-meal preview for lunches and dinners
- **Exclusion_List**: A persistent list of MealComponent IDs that the User has removed; excluded components are filtered out before meal composition
- **Meal_Preference**: The combination of cuisine preference (north_indian, south_indian, both), diet preference (veg, non_veg, both), and meal style (health, regular)
- **CandidateDishes**: The data structure holding candidate breakfasts (Meal objects) and candidate MealComponents (grouped by ComponentCategory) for the preview
- **Weekly_Plan**: A 7-day meal plan containing breakfast, lunch, and dinner for each day

## Requirements

### Requirement 1: Component-Level Preview for Lunches and Dinners

**User Story:** As a User, I want to see individual meal components (base, gravy, dry_veggie, side) in the dish preview instead of composed meals, so that I can remove specific components I dislike without those components reappearing in different meal combinations.

#### Acceptance Criteria

1. WHEN the Bot generates a Dish_Preview for lunches and dinners, THE Bot SHALL display individual MealComponents grouped by ComponentCategory (base, gravy, dry_veggie, side) instead of displaying ComposedMeals
2. THE Bot SHALL present each MealComponent in the Component_Preview as a selectable interactive button so the User can remove a component with a single tap
3. THE Bot SHALL display the component name and its ComponentCategory label for each MealComponent in the Component_Preview
4. WHEN the Bot generates the Component_Preview, THE Bot SHALL include all MealComponents that match the User's Meal_Preference (cuisine, diet, style) and are compatible with the lunch or dinner slot
5. WHEN the Bot generates the Component_Preview, THE Bot SHALL exclude any MealComponent whose ID is present in the Exclusion_List

### Requirement 2: Component-Level Exclusion Tracking

**User Story:** As a User, I want my removed components tracked by component ID, so that a removed component cannot reappear in any future meal combination.

#### Acceptance Criteria

1. WHEN the User removes a MealComponent from the Component_Preview, THE Bot SHALL add the MealComponent ID to the Exclusion_List
2. THE Bot SHALL persist the Exclusion_List across sessions until the User changes their Meal_Preference
3. WHEN the User changes their Meal_Preference, THE Bot SHALL clear the Exclusion_List
4. THE Exclusion_List SHALL store MealComponent IDs for lunch and dinner components, and Meal IDs for breakfasts

### Requirement 3: Component Removal and Preview Update

**User Story:** As a User, I want to remove individual components from the preview and see the updated list, so that I can iteratively refine my component selections.

#### Acceptance Criteria

1. WHILE the User is reviewing the Component_Preview, THE Bot SHALL allow the User to remove one or more MealComponents by tapping the corresponding interactive buttons
2. WHEN the User removes a MealComponent from the Component_Preview, THE Bot SHALL remove the component from the displayed list and present the updated Component_Preview
3. WHEN the User removes a MealComponent, THE Bot SHALL confirm the removal by displaying the removed component name in a confirmation message
4. IF the User removes all MealComponents in a ComponentCategory, THEN THE Bot SHALL inform the User that at least one component per ComponentCategory is required for meal composition and re-present the Component_Preview before the removal

### Requirement 4: Meal Composition from Remaining Components

**User Story:** As a User, I want the system to compose meals from my remaining (non-excluded) components after I confirm the preview, so that my weekly plan only contains components I have approved.

#### Acceptance Criteria

1. WHEN the User confirms the Component_Preview, THE Bot SHALL compose 7 lunches and 7 dinners using only MealComponents not present in the Exclusion_List
2. WHEN composing meals, THE Bot SHALL select one MealComponent per ComponentCategory (base, gravy, dry_veggie, side) for each ComposedMeal
3. WHEN composing meals, THE Bot SHALL apply the existing variety constraints (sliding-window history, same-day deduplication, ingredient overlap avoidance) from the plan generator
4. THE Bot SHALL combine the composed lunches and dinners with the confirmed breakfasts to produce the Weekly_Plan
5. IF the remaining MealComponents in any ComponentCategory are insufficient to compose 7 meals for a slot, THEN THE Bot SHALL reuse components across days to fill all 7 days

### Requirement 5: Breakfast Preview Unchanged

**User Story:** As a User, I want the breakfast preview to continue working as it does today, so that the component-based changes only affect lunches and dinners.

#### Acceptance Criteria

1. THE Bot SHALL continue to display breakfasts as complete Meal objects in the Dish_Preview (not as individual components)
2. WHEN the User removes a breakfast from the Dish_Preview, THE Bot SHALL replace the removed breakfast with a new breakfast from the available pool and present the updated preview
3. THE Bot SHALL track removed breakfast IDs in the Exclusion_List using the Meal ID (not component IDs)

### Requirement 6: CandidateDishes Data Structure Update

**User Story:** As a developer, I want the CandidateDishes structure to hold individual components instead of composed meals for lunches and dinners, so that the preview and exclusion logic operates at the component level.

#### Acceptance Criteria

1. THE CandidateDishes structure SHALL store lunch and dinner candidates as arrays of MealComponents grouped by ComponentCategory, instead of arrays of ComposedMeals
2. THE CandidateDishes structure SHALL continue to store breakfast candidates as an array of Meal objects
3. WHEN the Bot serializes CandidateDishes to persistent storage, THE Bot SHALL store the component-level structure so that the preview state survives session interruptions

### Requirement 7: Message Formatting for Component Preview

**User Story:** As a User, I want the component preview message to clearly show components organized by category, so that I can easily understand and manage my selections.

#### Acceptance Criteria

1. WHEN formatting the Component_Preview message, THE Bot SHALL group MealComponents under category headings (Base, Gravy, Dry Veggie, Side)
2. WHEN formatting the Component_Preview message, THE Bot SHALL list each MealComponent name under its category heading
3. WHEN a MealComponent is removed, THE Bot SHALL display a confirmation message containing the removed component name and its category
4. THE Bot SHALL display a "Confirm Dishes" button alongside the component removal buttons in the Component_Preview

### Requirement 8: Style Fallback — Suggest Regular Options When Health Options Run Out

**User Story:** As a User with a health meal style preference, I want the bot to suggest regular options when healthy options are exhausted, so that I still get a complete meal plan without being stuck.

#### Acceptance Criteria

1. WHEN the Bot generates the Component_Preview for a User with style preference "health" AND the available health-style MealComponents in any ComponentCategory are fewer than 2 after applying the Exclusion_List, THE Bot SHALL include regular-style MealComponents for that ComponentCategory as fallback options
2. WHEN the Bot includes regular-style fallback MealComponents, THE Bot SHALL label them with a "(Regular)" suffix in the Component_Preview so the User can distinguish them from health-style options
3. WHEN composing meals, IF health-style MealComponents in a ComponentCategory are insufficient, THE Bot SHALL use regular-style MealComponents as fallback to fill the remaining slots
4. THE Bot SHALL prioritize health-style MealComponents over regular-style MealComponents when both are available during meal composition

### Requirement 9: Diet Fallback — Non-Veg Users Also Get Veg Options

**User Story:** As a User with a non-veg diet preference, I want to also see veg options in my component preview, so that I have more variety and can choose from both veg and non-veg components.

#### Acceptance Criteria

1. WHEN the Bot generates the Component_Preview for a User with diet preference "non_veg", THE Bot SHALL include both non-veg and veg MealComponents that match the User's other preferences (cuisine, style, slot)
2. WHEN composing meals for a User with diet preference "non_veg", THE Bot SHALL use both veg and non-veg MealComponents from the confirmed component pool
3. THE Bot SHALL NOT apply this fallback for Users with diet preference "veg" — veg Users SHALL only see veg MealComponents
4. WHEN the User's diet preference is "both", THE Bot SHALL continue to include both veg and non-veg MealComponents as it does today
