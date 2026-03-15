# Requirements Document

## Introduction

This feature enhances the WhatsApp meal planner bot's user experience with six key improvements: (1) a dish preview and removal step before weekly plan generation, (2) cook's phone number collection during onboarding, (3) automatic weekly plan generation after onboarding completes, (4) a restructured main menu with quick actions and a "More Options" submenu, (5) weekly grocery list shown alongside the weekly meal plan, and (6) preference and cook number editing from the "More Options" submenu.

## Glossary

- **Bot**: The WhatsApp-based SmartMealPlanner chatbot that processes user messages and returns meal planning responses
- **User**: A person interacting with the Bot via WhatsApp
- **Cook**: A person designated by the User to receive meal plans via WhatsApp
- **Onboarding_Flow**: The initial conversation sequence that collects cuisine, diet, meal style, and optionally cook's phone number from a new User
- **Dish_Preview**: A list of candidate dishes the Bot presents to the User before generating the weekly plan
- **Weekly_Plan**: A 7-day meal plan containing breakfast, lunch, and dinner for each day
- **Grocery_List**: An aggregated list of ingredients derived from a Weekly_Plan
- **Main_Menu**: The primary set of quick-action buttons shown when a User opens the chat or completes an action
- **More_Options_Menu**: A secondary menu accessible from the Main_Menu containing less frequently used actions
- **Interactive_Button**: A WhatsApp interactive message button that the User can tap to trigger an action without typing
- **Meal_Preference**: The combination of cuisine preference (north indian, south indian, both) and diet preference (veg, non-veg, both)

## Requirements

### Requirement 1: Dish Preview Before Weekly Plan Generation

**User Story:** As a User, I want to see a list of all candidate dishes before the weekly plan is created, so that I can remove any dishes I do not want.

#### Acceptance Criteria

1. WHEN the User requests a new weekly plan, THE Bot SHALL generate a candidate dish list based on the User's Meal_Preference and present the Dish_Preview to the User before creating the Weekly_Plan
2. THE Bot SHALL display each dish in the Dish_Preview as a selectable Interactive_Button so the User can remove a dish with a single tap
3. WHILE the User is reviewing the Dish_Preview, THE Bot SHALL allow the User to remove one or more dishes by tapping the corresponding Interactive_Buttons
4. WHEN the User removes a dish from the Dish_Preview, THE Bot SHALL replace the removed dish with a new dish from the available dish pool and present the updated Dish_Preview
5. THE Bot SHALL maintain a persistent exclusion list of dishes removed by the User; removed dishes SHALL NOT appear in any future Dish_Preview or Weekly_Plan until the User changes their Meal_Preference
6. WHEN the User confirms the Dish_Preview, THE Bot SHALL generate the Weekly_Plan using only the confirmed dishes
6. IF no dishes remain after removal, THEN THE Bot SHALL inform the User that at least one dish per meal slot is required and re-present the original Dish_Preview

### Requirement 2: Cook's Number Collection During Onboarding

**User Story:** As a User, I want to optionally provide my cook's WhatsApp number during onboarding, so that I can send meal plans to my cook without a separate setup step.

#### Acceptance Criteria

1. WHEN the User completes the meal style selection step of the Onboarding_Flow, THE Bot SHALL prompt the User to enter the Cook's WhatsApp number
2. THE Bot SHALL display a "Skip" Interactive_Button alongside the cook number prompt so the User can skip this step with a single tap
3. WHEN the User provides a valid phone number with country code, THE Bot SHALL save the cook's number to the User's profile and proceed to the next onboarding step
4. WHEN the User taps the "Skip" button, THE Bot SHALL proceed to the next onboarding step without saving a cook number
5. IF the User provides an invalid phone number format, THEN THE Bot SHALL display a validation error and re-prompt for the cook's number with the "Skip" option

### Requirement 3: Automatic Weekly Plan After Onboarding

**User Story:** As a User, I want to receive my first weekly meal plan immediately after onboarding completes, so that I can start using the planner without additional steps.

#### Acceptance Criteria

1. WHEN the User completes the Onboarding_Flow (after cook number step or skip), THE Bot SHALL automatically generate and display the Weekly_Plan based on the User's selected preferences
2. WHEN the automatic Weekly_Plan is generated, THE Bot SHALL present the Dish_Preview for confirmation before finalizing the plan (following Requirement 1 flow)
3. WHEN the automatic Weekly_Plan is displayed after onboarding, THE Bot SHALL show the Main_Menu buttons and include a text hint to tap "More Options" for the weekly grocery list (following Requirement 4 flow)

### Requirement 4: Weekly Grocery List On Demand via More Options

**User Story:** As a User, I want to access the weekly grocery list through the More Options menu, so that the weekly plan display stays clean and I can view the grocery list when I need it.

#### Acceptance Criteria

1. WHEN the Bot displays a new Weekly_Plan, THE Bot SHALL include a text hint in the message telling the User to tap "More Options" to view the weekly grocery list
2. WHEN the Bot displays a new Weekly_Plan, THE Bot SHALL show the Main_Menu buttons ("Tomorrow's Meal Plan", "Tomorrow's Grocery", "Send Menu to Cook", "More Options") below the plan — NOT a separate grocery list button
3. THE Bot SHALL NOT automatically display the Grocery_List alongside the Weekly_Plan
4. WHEN the User taps "View Weekly Grocery List" from the More_Options_Menu, THE Bot SHALL generate and display the Grocery_List for the current Weekly_Plan

### Requirement 5: Restructured Main Menu with Quick Actions

**User Story:** As a User, I want to see the most common actions as quick buttons when I open the chat, so that I can access key features with a single tap.

#### Acceptance Criteria

1. WHEN an onboarded User sends any message while in the main_menu state, THE Bot SHALL display the Main_Menu with the following Interactive_Buttons: "Tomorrow's Meal Plan", "Tomorrow's Grocery", "Send Menu to Cook", and "More Options"
2. WHEN the User taps "Tomorrow's Meal Plan", THE Bot SHALL display the meal plan for the next day
3. WHEN the User taps "Tomorrow's Grocery", THE Bot SHALL display the grocery list for the next day
4. WHEN the User taps "Send Menu to Cook", THE Bot SHALL send tomorrow's meal plan to the saved Cook's WhatsApp number
5. WHEN the User taps "More Options", THE Bot SHALL display the More_Options_Menu
6. IF the User taps "Send Menu to Cook" and no Cook number is saved, THEN THE Bot SHALL prompt the User to save a Cook's number first

### Requirement 6: More Options Submenu

**User Story:** As a User, I want to access less frequent actions like viewing the full weekly plan, changing preferences, and managing my cook's number from a submenu, so that the main menu stays uncluttered.

#### Acceptance Criteria

1. WHEN the User taps "More Options" from the Main_Menu, THE Bot SHALL display the More_Options_Menu with the following Interactive_Buttons: "Weekly Meal Plan", "View Weekly Grocery List", "Change Meal Preference", and "Change Cook's Number"
2. WHEN the User taps "Weekly Meal Plan", THE Bot SHALL display the current Weekly_Plan or generate a new one if none exists
3. WHEN the User taps "View Weekly Grocery List", THE Bot SHALL display the Grocery_List for the current Weekly_Plan
4. WHEN the User taps "Change Meal Preference", THE Bot SHALL restart the preference selection flow (cuisine and diet) and regenerate the Weekly_Plan after new preferences are saved
5. WHEN the User taps "Change Cook's Number", THE Bot SHALL prompt the User to enter a new Cook's WhatsApp number
6. WHEN the User completes a preference change, THE Bot SHALL save the updated preferences and return to the Main_Menu
7. IF the User taps "Weekly Meal Plan" or "View Weekly Grocery List" and no Weekly_Plan exists, THEN THE Bot SHALL initiate the plan generation flow (starting with Dish_Preview per Requirement 1)
