# Requirements Document

## Introduction

Redesign the SmartMealPlanner conversational workflow to support a structured, multi-entry-point flow for a WhatsApp-based meal planning bot. The system supports onboarding, weekly plan generation, daily reminders, meal changes (few meals, entire plan, preferences), grocery list generation, and cook messaging. The workflow defines a core user loop: Weekly Plan → Grocery → Daily Reminder → Tomorrow Plan → Cook / Change → Repeat.

## Glossary

- **Bot**: The SmartMealPlanner WhatsApp chatbot that processes user messages and responds with meal plans, grocery lists, and actions.
- **User**: A person interacting with the Bot via WhatsApp.
- **Onboarding_Flow**: The first-time setup sequence that captures user preferences (diet, style, cuisine) and optionally a cook's phone number before generating the initial weekly plan.
- **Weekly_Plan**: A 7-day meal plan (Monday–Sunday) containing breakfast, lunch, and dinner for each day.
- **Day_Plan**: A single day's meals consisting of breakfast, lunch, and dinner.
- **Grocery_List**: An aggregated list of ingredients derived from a Weekly_Plan or a single Day_Plan.
- **Cook_Number**: The WhatsApp phone number of the user's cook, stored for sending meal plans.
- **Preferences**: User configuration consisting of diet (veg / non-veg), style (health / regular), and cuisine (north / south / mix).
- **Daily_Reminder**: An automated message sent at 8 PM showing tomorrow's meal plan with action buttons.
- **Weekly_Reminder**: An automated message sent on Sunday at 6 PM prompting the user to generate a new weekly plan.
- **Change_Plan_Flow**: A sub-workflow allowing the user to modify their plan by changing a few meals, regenerating the entire plan, or updating preferences.
- **Few_Meals_Flow**: A day-wise meal replacement sub-flow where the user selects a day, a meal slot, picks from 3 alternatives, and can loop to change more.
- **Entire_Plan_Flow**: A full plan regeneration that keeps preferences, excludes ~70% of current meals, and generates a new plan.
- **Adhoc_Menu**: A menu shown when the user sends "hi" or "menu" outside of any active flow, offering quick access to weekly plan, tomorrow's plan, and preferences.
- **Meal_Slot**: One of breakfast, lunch, or dinner.
- **Composed_Meal**: A lunch or dinner assembled from four components: base, gravy, dry_veggie, and side.

## Requirements

### Requirement 1: Entry Point Routing

**User Story:** As a User, I want to access the Bot through multiple entry points, so that I can interact with the meal planner from onboarding, reminders, or ad-hoc messages.

#### Acceptance Criteria

1. WHEN a first-time User sends any message, THE Bot SHALL route the User to the Onboarding_Flow.
2. WHEN the Daily_Reminder triggers at 8 PM, THE Bot SHALL send the User tomorrow's Day_Plan with action buttons.
3. WHEN the Weekly_Reminder triggers on Sunday at 6 PM, THE Bot SHALL send the User a prompt to generate a new Weekly_Plan.
4. WHEN an onboarded User sends "hi" or "menu", THE Bot SHALL display the Adhoc_Menu with options for Weekly_Plan, tomorrow's Day_Plan, and Preferences.

### Requirement 2: Onboarding Flow

**User Story:** As a new User, I want to set up my meal preferences during onboarding, so that the Bot can generate a personalized weekly plan.

#### Acceptance Criteria

1. WHEN the Onboarding_Flow starts, THE Bot SHALL prompt the User to select a diet preference from veg and non-veg.
2. WHEN the User selects a diet preference, THE Bot SHALL prompt the User to select a style preference from health and regular.
3. WHEN the User selects a style preference, THE Bot SHALL prompt the User to select a cuisine preference from north, south, and mix.
4. WHEN the User completes all three preference selections, THE Bot SHALL generate a Weekly_Plan based on the captured Preferences.
5. WHEN the Weekly_Plan is generated after onboarding, THE Bot SHALL display the Weekly_Plan and offer a primary action to view the Grocery_List and a secondary action to change the plan.
6. IF the User provides an invalid selection during any onboarding step, THEN THE Bot SHALL re-prompt the same step with the valid options.

### Requirement 3: Weekly Plan Generation and Display

**User Story:** As a User, I want to generate and view a weekly meal plan, so that I can plan my meals for the entire week.

#### Acceptance Criteria

1. WHEN the User requests a new Weekly_Plan, THE Bot SHALL generate a 7-day plan (Monday–Sunday) with breakfast, lunch, and dinner for each day.
2. THE Bot SHALL use the User's stored Preferences (diet, style, cuisine) when generating the Weekly_Plan.
3. WHEN the Weekly_Plan is displayed, THE Bot SHALL show each day's breakfast, lunch, and dinner meal names.
4. WHEN the Weekly_Plan is displayed after the weekly flow, THE Bot SHALL offer actions to view the Grocery_List, see tomorrow's meals, and change the plan.

### Requirement 13: Meal Generation Constraint Enforcement

**User Story:** As a User, I want every generated plan, meal swap, and plan regeneration to respect dietary and variety constraints, so that my meals are diverse, nutritionally coherent, and match my preferences.

#### Acceptance Criteria

1. WHEN generating a Weekly_Plan, swapping a meal in the Few_Meals_Flow, or regenerating in the Entire_Plan_Flow, THE Bot SHALL apply all of the following constraints in order:
   - Cuisine filter: only include meals and components matching the User's cuisine Preference; when cuisine is "both", use north_indian filtering (includes pure NI and dual-tagged crossover items, excludes south_indian-only items).
   - Diet filter: only include meals and components matching the User's diet Preference; non-veg users SHALL also see all veg dishes (diet fallback).
   - Style filter: only include meals and components matching the User's style Preference; when a component category has fewer than 2 options in the preferred style, items from the other style SHALL be added with a label suffix (style fallback).
   - Excluded dishes filter: dishes the User has previously removed SHALL be excluded from all selections.
2. WHEN composing a lunch or dinner (Composed_Meal), THE Bot SHALL enforce the following variety and coherence constraints with progressive relaxation:
   - Sliding window variety: the same component SHALL NOT repeat within the recent history window for that slot; if all options have been used, the constraint SHALL be relaxed.
   - Same-day deduplication: the same gravy or dry_veggie component SHALL NOT appear in both lunch and dinner on the same day; bases and sides are exempt. If no alternatives exist, the constraint SHALL be relaxed.
   - Ingredient overlap avoidance: two components in the same meal SHALL NOT share key ingredients (proteins, signature vegetables); lunch and dinner on the same day SHALL avoid sharing signature ingredients between gravy and dry_veggie components.
   - Protein conflict avoidance: components from different protein groups (e.g., chicken + fish) SHALL NOT be paired in the same meal.
   - Dual-protein prevention: if the gravy is a protein dish, the dry_veggie SHALL prefer a non-protein dish.
   - Cuisine coherence: when a base is pure single-cuisine, the accompanying gravy, dry_veggie, and side SHALL prefer items from the same cuisine lineage.
3. WHEN swapping a meal in the Few_Meals_Flow, THE Bot SHALL ensure the replacement meal respects same-day deduplication against the other slot's components for that day.
4. WHEN regenerating the entire plan in the Entire_Plan_Flow, THE Bot SHALL apply the same constraint pipeline as initial generation, including sliding window, same-day dedup, ingredient overlap, and protein conflict avoidance.
5. IF a constraint would leave zero candidates, THEN THE Bot SHALL progressively relax constraints in order (ingredient overlap → sliding window → protein constraints → same-day dedup) rather than failing.
6. WHEN the User changes Preferences, THE Bot SHALL clear excluded dish IDs and re-apply all constraints using the new Preferences during plan regeneration.

### Requirement 4: Daily Reminder Flow

**User Story:** As a User, I want to receive a daily reminder at 8 PM with tomorrow's meals, so that I can prepare or make changes in advance.

#### Acceptance Criteria

1. WHEN the Daily_Reminder triggers, THE Bot SHALL display tomorrow's Day_Plan showing breakfast, lunch, and dinner.
2. WHEN the Daily_Reminder is displayed, THE Bot SHALL offer action buttons for viewing tomorrow's Grocery_List, sending the menu to the cook, and changing a meal.
3. IF the User has no active Weekly_Plan when the Daily_Reminder triggers, THEN THE Bot SHALL prompt the User to generate a new Weekly_Plan.
4. IF the User's Weekly_Plan has expired (tomorrow falls outside the plan range) when the Daily_Reminder triggers, THEN THE Bot SHALL prompt the User to generate a new Weekly_Plan.

### Requirement 5: Change Plan Flow

**User Story:** As a User, I want to change my meal plan, so that I can adjust meals I don't like or update my preferences.

#### Acceptance Criteria

1. WHEN the User selects "Change Plan", THE Bot SHALL present three options: change a few meals, regenerate the entire plan, and change preferences.
2. THE Bot SHALL default the selection to "few meals" when presenting the Change_Plan_Flow options.

### Requirement 6: Few Meals Replacement Flow

**User Story:** As a User, I want to replace individual meals day by day, so that I can swap out specific meals I don't want.

#### Acceptance Criteria

1. WHEN the User enters the Few_Meals_Flow, THE Bot SHALL prompt the User to select a day (Monday–Sunday).
2. WHEN the User selects a day, THE Bot SHALL prompt the User to select a Meal_Slot (breakfast, lunch, or dinner).
3. WHEN the User selects a Meal_Slot, THE Bot SHALL display 3 alternative meal options for that slot.
4. WHEN the User selects one of the 3 alternatives, THE Bot SHALL update the Weekly_Plan with the selected meal for that day and slot.
5. WHEN a meal replacement is confirmed, THE Bot SHALL offer the User a choice to change more meals or finish.
6. WHEN the User chooses to change more meals, THE Bot SHALL return to the day selection step of the Few_Meals_Flow.
7. IF no alternative meals are available for the selected slot, THEN THE Bot SHALL inform the User that no alternatives are available and return to the day selection step.

### Requirement 7: Entire Plan Regeneration Flow

**User Story:** As a User, I want to regenerate my entire weekly plan, so that I get a fresh set of meals while keeping my preferences.

#### Acceptance Criteria

1. WHEN the User selects "Entire Plan" from the Change_Plan_Flow, THE Bot SHALL regenerate the Weekly_Plan using the same Preferences.
2. WHEN regenerating the entire plan, THE Bot SHALL exclude approximately 70% of the meals from the current Weekly_Plan to ensure variety.
3. WHEN the new Weekly_Plan is generated, THE Bot SHALL display the plan and offer actions to accept or retry.
4. WHEN the User selects "Accept", THE Bot SHALL save the new Weekly_Plan and return to the main flow.
5. WHEN the User selects "Retry", THE Bot SHALL regenerate the Weekly_Plan again following the same exclusion logic.

### Requirement 8: Change Preferences Flow

**User Story:** As a User, I want to update my meal preferences, so that future plans reflect my current dietary needs.

#### Acceptance Criteria

1. WHEN the User selects "Change Preferences" from the Change_Plan_Flow, THE Bot SHALL prompt the User to re-enter diet, style, and cuisine preferences in sequence.
2. WHEN the User completes all preference updates, THE Bot SHALL regenerate the Weekly_Plan using the new Preferences.
3. WHEN the new Weekly_Plan is generated after a preference change, THE Bot SHALL clear any previously excluded dish IDs.

### Requirement 9: Grocery List Generation

**User Story:** As a User, I want to view a grocery list, so that I know what ingredients to buy.

#### Acceptance Criteria

1. WHEN the User requests a weekly Grocery_List, THE Bot SHALL aggregate all ingredients from the entire Weekly_Plan.
2. WHEN the User requests tomorrow's Grocery_List, THE Bot SHALL aggregate ingredients from tomorrow's Day_Plan only.
3. THE Bot SHALL group Grocery_List items by ingredient category (e.g., protein, vegetables, dairy).
4. THE Bot SHALL display each Grocery_List item with its name and quantity.

### Requirement 10: Send to Cook Flow

**User Story:** As a User, I want to send tomorrow's meal plan to my cook, so that the cook can prepare the meals.

#### Acceptance Criteria

1. WHEN the User selects "Send to Cook" and a Cook_Number is saved, THE Bot SHALL send a formatted message containing tomorrow's Day_Plan and ingredients to the Cook_Number.
2. IF the User selects "Send to Cook" and no Cook_Number is saved, THEN THE Bot SHALL prompt the User to enter a Cook_Number.
3. WHEN the User provides a valid Cook_Number, THE Bot SHALL save the Cook_Number and proceed to send the meal plan.
4. IF the User provides an invalid Cook_Number, THEN THE Bot SHALL inform the User that the number is invalid and re-prompt for a valid Cook_Number.

### Requirement 11: Adhoc Menu

**User Story:** As a User, I want to access key features from a quick menu, so that I can navigate the Bot outside of scheduled reminders.

#### Acceptance Criteria

1. WHEN an onboarded User sends "hi" or "menu", THE Bot SHALL display the Adhoc_Menu.
2. THE Adhoc_Menu SHALL include options for viewing the Weekly_Plan, viewing tomorrow's Day_Plan, and changing Preferences.
3. WHEN the User selects an option from the Adhoc_Menu, THE Bot SHALL route the User to the corresponding flow.
4. EVERY terminal message (end of a flow step such as plan display, grocery list, meal swap confirmation, cook message sent, or reminder) SHALL include a footer hint: `Type "hi" to start a new conversation`.

### Requirement 12: Conversation State Management

**User Story:** As a User, I want the Bot to remember where I am in the conversation, so that I can resume interactions seamlessly.

#### Acceptance Criteria

1. THE Bot SHALL persist the User's conversation state across messages, including the current flow step, Preferences, Weekly_Plan, and Cook_Number.
2. WHEN the User sends a message, THE Bot SHALL load the User's persisted state and route to the correct flow step.
3. WHEN a flow completes, THE Bot SHALL update the conversation state to reflect the new position in the workflow.
4. IF the User sends an unexpected message during an active flow, THEN THE Bot SHALL re-prompt the current step with valid options.
