# Requirements Document

## Introduction

This document defines the requirements for a WhatsApp-based meal planner bot (SmartMealPlanner-Bot). The bot helps users plan weekly meals based on their cuisine and dietary preferences, generates grocery lists, manages cook communication, and sends weekly Sunday reminders to prompt new meal plans. It uses WhatsApp as the primary interface with clickable buttons for interaction, reads meal data from an external asset file (`meals.js`), and persists user state in AWS DynamoDB.

The system is architected with a delivery-channel-agnostic core so that the same meal planning business logic can be reused across future delivery channels (mobile app, web app) with no changes to the core layer.

## Glossary

- **Bot**: The WhatsApp meal planner application that receives and responds to user messages
- **User**: A person interacting with the Bot via WhatsApp
- **Cook**: A person designated by the User to receive tomorrow's meal menu via WhatsApp
- **Onboarding_Flow**: The initial setup conversation where the Bot collects User preferences
- **Cuisine_Preference**: The User's choice of North Indian, South Indian, or Both
- **Diet_Preference**: The User's choice of Vegetarian or Non-Vegetarian
- **Meal_Style**: The User's choice of Health meals or Regular Home meals
- **Weekly_Plan**: A 7-day meal plan containing breakfast, lunch, and dinner for each day
- **Grocery_List**: A consolidated list of ingredients required for a given set of meals
- **Meal_Database**: The external asset file (`meals.js`) containing all available meal options
- **User_State**: The persisted record of a User's preferences, plans, and cook info stored in DynamoDB
- **Reminder_Service**: The cron-based services that trigger reminders — a daily 8 PM cron for tomorrow's meal plan and a weekly Sunday 8 PM cron for new weekly plan generation
- **Sender_Number**: The fixed WhatsApp number (+17655483740) used by the Bot to send messages
- **Message_Catalog**: The centralized file (`src/messages.ts`) containing all user-facing text strings used by the Bot, separate from bot logic
- **Button_Message**: A WhatsApp message containing clickable interactive buttons for User selection
- **Core_Layer**: The delivery-channel-agnostic module containing all business logic, with zero dependencies on WhatsApp, Twilio, DynamoDB, or Lambda
- **Port**: An interface defined in the Core_Layer that abstracts an external dependency (e.g., data storage, messaging)
- **Adapter**: A concrete implementation of a Port for a specific technology (e.g., DynamoDB, Twilio)
- **Intent**: A named user action (e.g., SELECT_CUISINE, GENERATE_PLAN, SWAP_LUNCH) that the Core_Layer processes, decoupled from any specific UI payload format
- **Structured_Response**: A response object produced by the Core_Layer containing an intent, data payload, and suggested actions — not formatted for any specific delivery channel
- **Delivery_Channel**: A user-facing interface through which the Bot communicates (e.g., WhatsApp, mobile app, web app)

## Requirements

### Requirement 1: User Onboarding — Cuisine Preference

**User Story:** As a User, I want to select my cuisine preference during onboarding, so that the Bot generates meal plans matching my taste.

#### Acceptance Criteria

1. WHEN a new User sends the first message to the Bot, THE Bot SHALL initiate the Onboarding_Flow by sending a Button_Message with three cuisine options: "North Indian", "South Indian", and "Both"
2. WHEN the User selects a Cuisine_Preference via the Button_Message, THE Bot SHALL store the selected Cuisine_Preference in the User_State in DynamoDB keyed by the User's WhatsApp number
3. WHEN the User selects "Both" as Cuisine_Preference, THE Bot SHALL record the preference to enable mixed North Indian and South Indian meals across days and meal slots in generated plans
4. IF the User sends a free-text message instead of clicking a button during Cuisine_Preference selection, THEN THE Bot SHALL resend the Button_Message with a prompt: "Please select one of the options below"

### Requirement 2: User Onboarding — Diet Preference

**User Story:** As a User, I want to select my diet preference during onboarding, so that the Bot only includes meals matching my dietary needs.

#### Acceptance Criteria

1. WHEN the User has selected a Cuisine_Preference, THE Bot SHALL send a Button_Message with two diet options: "Veg" and "Non-Veg"
2. WHEN the User selects a Diet_Preference via the Button_Message, THE Bot SHALL store the selected Diet_Preference in the User_State in DynamoDB
3. IF the User sends a free-text message instead of clicking a button during Diet_Preference selection, THEN THE Bot SHALL resend the Button_Message with a prompt: "Please select one of the options below"

### Requirement 3: User Onboarding — Meal Style Preference

**User Story:** As a User, I want to select my meal style during onboarding, so that the Bot generates plans suited to my lifestyle.

#### Acceptance Criteria

1. WHEN the User has selected a Diet_Preference, THE Bot SHALL send a Button_Message with two meal style options: "Health" and "Regular Home Meals"
2. WHEN the User selects a Meal_Style via the Button_Message, THE Bot SHALL store the selected Meal_Style in the User_State in DynamoDB
3. WHEN the User completes all three onboarding selections (Cuisine_Preference, Diet_Preference, Meal_Style), THE Bot SHALL mark the Onboarding_Flow as complete in the User_State
4. IF the User sends a free-text message instead of clicking a button during Meal_Style selection, THEN THE Bot SHALL resend the Button_Message with a prompt: "Please select one of the options below"

### Requirement 4: Weekly Meal Plan Generation

**User Story:** As a User, I want to receive a weekly meal plan based on my preferences, so that I can plan my meals for the entire week.

#### Acceptance Criteria

1. WHEN the User requests a weekly meal plan (via the main menu Button_Message), THE Bot SHALL generate a Weekly_Plan containing breakfast, lunch, and dinner for 7 consecutive days
2. THE Bot SHALL read all available meals from the Meal_Database (`meals.js`) when generating a Weekly_Plan
3. THE Bot SHALL filter meals from the Meal_Database based on the User's stored Cuisine_Preference, Diet_Preference, and Meal_Style before generating the Weekly_Plan
4. THE Bot SHALL ensure that no meal repeats on the same day across breakfast, lunch, and dinner slots within the Weekly_Plan
5. THE Bot SHALL ensure that no meal repeats on consecutive days within the same meal slot (e.g., Monday lunch differs from Tuesday lunch) in the Weekly_Plan
6. WHEN the User's Cuisine_Preference is "Both", THE Bot SHALL include a mix of North Indian and South Indian meals distributed across different days and meal slots in the Weekly_Plan
7. THE Bot SHALL store the generated Weekly_Plan in the User_State in DynamoDB
8. THE Bot SHALL send the Weekly_Plan to the User as a human-friendly formatted WhatsApp message, organized by day and meal slot

### Requirement 5: Weekly Grocery List

**User Story:** As a User, I want to receive a consolidated grocery list for the week, so that I can shop for all ingredients at once.

#### Acceptance Criteria

1. WHEN the User requests a weekly grocery list (via the main menu Button_Message), THE Bot SHALL generate a Grocery_List by aggregating all ingredients from the current Weekly_Plan stored in the User_State
2. THE Bot SHALL send the weekly Grocery_List to the User as a human-friendly formatted WhatsApp message, grouped by ingredient category where possible
3. IF no Weekly_Plan exists in the User_State when the User requests a weekly grocery list, THEN THE Bot SHALL inform the User: "Please generate a weekly meal plan first" and present the main menu Button_Message

### Requirement 6: Tomorrow's Meal Plan

**User Story:** As a User, I want to see tomorrow's meals from my weekly plan, so that I can prepare accordingly.

#### Acceptance Criteria

1. WHEN the User requests tomorrow's meal plan (via the main menu Button_Message), THE Bot SHALL extract the next day's breakfast, lunch, and dinner from the stored Weekly_Plan
2. THE Bot SHALL send tomorrow's meal plan to the User as a human-friendly formatted WhatsApp message listing breakfast, lunch, and dinner
3. IF no Weekly_Plan exists in the User_State when the User requests tomorrow's meal plan, THEN THE Bot SHALL inform the User: "Please generate a weekly meal plan first" and present the main menu Button_Message

### Requirement 7: Tomorrow's Grocery List

**User Story:** As a User, I want to see the grocery list for just tomorrow's meals, so that I can buy only what I need for the next day.

#### Acceptance Criteria

1. WHEN the User requests tomorrow's grocery list (via the main menu Button_Message), THE Bot SHALL generate a Grocery_List by aggregating ingredients from only the next day's meals in the stored Weekly_Plan
2. THE Bot SHALL send tomorrow's Grocery_List to the User as a human-friendly formatted WhatsApp message
3. IF no Weekly_Plan exists in the User_State when the User requests tomorrow's grocery list, THEN THE Bot SHALL inform the User: "Please generate a weekly meal plan first" and present the main menu Button_Message

### Requirement 8: Cook Number Management

**User Story:** As a User, I want to save my cook's WhatsApp number, so that the Bot can send meal information directly to the cook.

#### Acceptance Criteria

1. WHEN the User selects "Save Cook's Number" from the main menu Button_Message, THE Bot SHALL prompt the User to enter the cook's WhatsApp number via a text message
2. WHEN the User provides a valid WhatsApp phone number (with country code), THE Bot SHALL store the cook's number in the User_State in DynamoDB
3. IF the User provides an invalid phone number format, THEN THE Bot SHALL inform the User: "Please enter a valid WhatsApp number with country code (e.g., +91XXXXXXXXXX)" and re-prompt for input
4. WHEN the cook's number is saved successfully, THE Bot SHALL confirm to the User: "Cook's number saved successfully" and return to the main menu Button_Message

### Requirement 9: Send Tomorrow's Menu to Cook

**User Story:** As a User, I want to send tomorrow's meal plan to my cook, so that the cook knows what to prepare.

#### Acceptance Criteria

1. WHEN the User selects "Send Menu to Cook" from the main menu Button_Message, THE Bot SHALL send tomorrow's meal plan (breakfast, lunch, dinner) to the stored cook's WhatsApp number using the Sender_Number (+17655483740)
2. THE Bot SHALL format the cook's message in a human-friendly format listing each meal slot and the corresponding dish
3. WHEN the message is sent successfully to the cook, THE Bot SHALL confirm to the User: "Tomorrow's menu has been sent to your cook"
4. IF no cook's number is stored in the User_State, THEN THE Bot SHALL inform the User: "Please save your cook's number first" and present the main menu Button_Message
5. IF no Weekly_Plan exists in the User_State, THEN THE Bot SHALL inform the User: "Please generate a weekly meal plan first" and present the main menu Button_Message

### Requirement 10: Swap Tomorrow's Lunch

**User Story:** As a User, I want to swap tomorrow's lunch with a different meal, so that I have flexibility when I don't like the planned dish.

#### Acceptance Criteria

1. WHEN the User selects "Swap Lunch" from the main menu Button_Message, THE Bot SHALL select a replacement lunch meal from the Meal_Database that matches the User's Cuisine_Preference, Diet_Preference, and Meal_Style
2. THE Bot SHALL ensure the replacement meal does not duplicate any other meal on the same day or the lunch meal on adjacent days in the Weekly_Plan
3. THE Bot SHALL update the Weekly_Plan in the User_State in DynamoDB with the swapped lunch meal
4. THE Bot SHALL send a confirmation message to the User showing the old lunch and the new lunch for tomorrow
5. IF no Weekly_Plan exists in the User_State, THEN THE Bot SHALL inform the User: "Please generate a weekly meal plan first" and present the main menu Button_Message

### Requirement 11: Main Menu Navigation

**User Story:** As a User, I want a main menu with all available actions, so that I can easily navigate the Bot's features.

#### Acceptance Criteria

1. WHEN the Onboarding_Flow is complete and the User sends any message, THE Bot SHALL respond with a main menu Button_Message containing the following options: "Weekly Meal Plan", "Weekly Grocery List", "Tomorrow's Plan", "Tomorrow's Grocery List", "Send Menu to Cook", "Swap Lunch", "Save Cook's Number"
2. WHEN the User completes any action (plan generation, grocery list, swap, etc.), THE Bot SHALL return to the main menu Button_Message
3. IF the User sends an unrecognized message while the main menu is active, THEN THE Bot SHALL resend the main menu Button_Message with a prompt: "Please select one of the options below"

### Requirement 12: Daily Reminder at 8 PM

**User Story:** As a User, I want to receive a daily reminder at 8 PM with tomorrow's meal plan, so that I can prepare in advance.

#### Acceptance Criteria

1. WHEN the Reminder_Service triggers at 8 PM daily, THE Bot SHALL send tomorrow's meal plan (breakfast, lunch, dinner) to each User who has a completed Onboarding_Flow and an active Weekly_Plan that covers the next day
2. THE Bot SHALL format the reminder message in a human-friendly format and include a Button_Message with options: "View Grocery List", "Swap Lunch", "Send to Cook"
3. THE Bot SHALL send the reminder using the Sender_Number (+17655483740)
4. IF a User's Weekly_Plan does not cover the next day (e.g., the plan has expired), THEN THE Bot SHALL send a reminder prompting the User to generate a new weekly plan with a Button_Message containing the option: "Generate Weekly Plan"

### Requirement 13: Weekly Sunday Reminder at 8 PM

**User Story:** As a User, I want to receive a reminder every Sunday at 8 PM prompting me to generate a new weekly meal plan, so that I always have a fresh plan for the upcoming week.

#### Acceptance Criteria

1. WHEN the Reminder_Service triggers at 8 PM every Sunday, THE Bot SHALL send a reminder to each User who has a completed Onboarding_Flow prompting them to generate a new Weekly_Plan for the upcoming week
2. THE Bot SHALL format the reminder message in a human-friendly format (e.g., "Hey! 🍽️ Time to plan your meals for the week ahead!") and include a Button_Message with the option: "Generate Weekly Plan"
3. THE Bot SHALL send the reminder using the Sender_Number (+17655483740)
4. IF a User already has an active Weekly_Plan that covers the upcoming week, THE Bot SHALL still send the reminder so the User can choose to regenerate a fresh plan
3. THE Bot SHALL send the reminder using the Sender_Number (+17655483740)
4. IF a User already has an active Weekly_Plan that covers the upcoming week, THE Bot SHALL still send the reminder so the User can choose to regenerate a fresh plan

### Requirement 14: User State Persistence

**User Story:** As a User, I want my preferences and plans to be saved, so that I don't have to re-enter information each time I interact with the Bot.

#### Acceptance Criteria

1. THE Bot SHALL persist all User_State data (Cuisine_Preference, Diet_Preference, Meal_Style, Weekly_Plan, cook's number, Onboarding_Flow status) in AWS DynamoDB
2. THE Bot SHALL use the User's WhatsApp phone number as the primary key for the User_State record in DynamoDB
3. WHEN the Bot receives a message from a returning User (Onboarding_Flow already complete), THE Bot SHALL load the User_State from DynamoDB and skip the Onboarding_Flow
4. WHEN any User_State field is updated (new plan, swapped meal, cook number), THE Bot SHALL persist the change to DynamoDB immediately

### Requirement 15: Meal Data Source

**User Story:** As a developer, I want meals to be read from an external asset file, so that the meal catalog can be updated independently of the Bot logic.

#### Acceptance Criteria

1. THE Bot SHALL read all meal data exclusively from the Meal_Database file (`meals.js`)
2. THE Meal_Database SHALL contain meal entries with at minimum: meal name, cuisine type (North Indian / South Indian), diet type (Veg / Non-Veg), meal style (Health / Regular), meal slot compatibility (breakfast / lunch / dinner), and ingredient list
3. THE Bot SHALL support adding new meals to the Meal_Database without requiring changes to the Bot's core logic

### Requirement 16: Human-Friendly Messaging

**User Story:** As a User, I want messages from the Bot to be easy to read and friendly, so that the interaction feels natural.

#### Acceptance Criteria

1. THE Bot SHALL use emojis, line breaks, and clear formatting in all WhatsApp messages sent to the User
2. THE Bot SHALL use conversational, warm language in all messages (e.g., "Here's your meal plan for the week 🍽️" instead of "Weekly plan generated")
3. THE Bot SHALL use WhatsApp interactive Button_Messages for all option selections instead of requiring the User to type responses
4. THE Bot SHALL define all user-facing text strings in a centralized Message_Catalog file (`src/messages.ts`), separate from bot logic code
5. THE Message_Catalog SHALL support emoji characters, template variables (e.g., `{cookNumber}`, `{oldMeal}`, `{newMeal}`), and WhatsApp text formatting (bold, italic, line breaks)
6. THE Bot SHALL support Twilio WhatsApp Content Templates (template SIDs) for structured messages, with template SIDs configurable per environment via Lambda environment variables
7. WHEN a developer updates user-facing message text, THE Message_Catalog SHALL allow the change without requiring modifications to bot logic code

### Requirement 18: Twilio WhatsApp Content Template SID Mapping

**User Story:** As a developer, I want all Twilio WhatsApp Content Template SIDs mapped by purpose in the codebase, so that the Bot sends the correct template for each interactive message.

#### Acceptance Criteria

1. THE Message_Catalog SHALL define a template SID mapping that associates each Bot interaction purpose (main_menu, menu_more, daily_reminder, cook_options, diet_selection, cuisine_selection, meal_style) with its corresponding Twilio Content Template SID
2. THE Bot SHALL use the following Twilio Content Template SIDs for Button_Messages:
   - Main menu: `HXe992435f98fde5249c641a135bb5dbd5` (Quick Reply) or `HX050102bc4bf8f0f9a48473db7ea7152e` (Quick Reply with button)
   - Menu more options: `HX7957efc7a19b2b9c8d2910ba15e6a2c5` (Quick Reply)
   - Daily reminder: `HX708fce9ebb60de686f73731e071aa8cb` (Text)
   - Cook options: `HX6eddbb2f0eb2678e3f505e3786dec4e8` (Quick Reply)
   - Diet selection: `HX5ad138d83501b0b1111e0a19a524dfd5` (Quick Reply)
   - Cuisine selection: `HX62d7649f7e38d88bec1b7d85b25ea83e` (Quick Reply)
   - Meal style: `HX26deeadd8ad7de0baf4568365e3da981` (Quick Reply)
3. THE TwilioMessagingProvider SHALL use the mapped template SID when sending a Button_Message via the Twilio Content API, passing the SID as the `contentSid` parameter
4. THE Message_Catalog SHALL allow overriding template SIDs via Lambda environment variables (`TWILIO_TEMPLATE_SID_MAIN_MENU`, `TWILIO_TEMPLATE_SID_MENU_MORE`, `TWILIO_TEMPLATE_SID_DAILY_REMINDER`, `TWILIO_TEMPLATE_SID_COOK_OPTIONS`, `TWILIO_TEMPLATE_SID_DIET_SELECTION`, `TWILIO_TEMPLATE_SID_CUISINE_SELECTION`, `TWILIO_TEMPLATE_SID_MEAL_STYLE`) so that dev and prod environments can use different templates
5. IF a template SID environment variable is not set, THEN THE Bot SHALL fall back to the hardcoded default SID defined in the Message_Catalog

### Requirement 17: Environment Separation and Testing

**User Story:** As a developer, I want separate dev and prod environments with easy testing workflows, so that I can develop and test safely without affecting production users.

#### Acceptance Criteria

1. THE Bot SHALL support two deployment environments: dev and prod, each with isolated AWS resources (DynamoDB tables, Lambda functions, API Gateway stages, and EventBridge rules)
2. THE Bot SHALL use environment-specific resource naming by suffixing resource names with the environment identifier (e.g., `MealPlannerUsers-dev`, `MealPlannerUsers-prod`)
3. THE Bot SHALL load all environment-specific configuration from Lambda environment variables: STAGE, DYNAMODB_TABLE, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER_NUMBER, and template SIDs
4. THE Bot SHALL expose separate API Gateway stages for each environment (e.g., `/dev/webhook` and `/prod/webhook`)
5. WHILE the Bot is deployed in the dev environment, THE Bot SHALL use a dev-specific Twilio sender number and dev-specific DynamoDB table, fully isolated from production data
6. WHILE the Bot is deployed in the dev environment, THE Bot SHALL have EventBridge reminder rules disabled by default to prevent unintended messages to test numbers
7. THE Bot SHALL provide deployment scripts (e.g., `npm run deploy:dev` and `npm run deploy:prod`) that deploy to the correct environment with the appropriate configuration
8. WHEN a developer deploys to the dev environment, THE Bot SHALL configure the Twilio webhook to point at the dev API Gateway stage endpoint
9. WHEN a developer deploys to the prod environment, THE Bot SHALL configure the Twilio webhook to point at the prod API Gateway stage endpoint with the production Twilio number and live DynamoDB table

### Requirement 19: Delivery-Channel-Agnostic Core Architecture

**User Story:** As a developer, I want the core business logic to be completely independent of any delivery channel (WhatsApp, mobile app, web app), so that I can build new frontends without modifying the core layer.

#### Acceptance Criteria

1. THE Core_Layer SHALL contain all business logic (plan generation, grocery list generation, swap logic, phone validation, conversation engine) with zero import dependencies on WhatsApp, Twilio, DynamoDB, Lambda, or any other infrastructure module
2. THE Core_Layer SHALL define Port interfaces (MealRepository, UserStateRepository, MessagingProvider) that abstract all external dependencies, and all core logic SHALL depend only on these Port interfaces
3. THE Core_Layer SHALL model all user interactions as named Intents (e.g., SELECT_CUISINE, GENERATE_PLAN, SWAP_LUNCH, SAVE_COOK_NUMBER) rather than coupling to any delivery-channel-specific payload format
4. WHEN the Core_Layer processes a user Intent, THE Core_Layer SHALL return a Structured_Response containing a response type, data payload, and suggested actions — not formatted for any specific Delivery_Channel
5. THE Delivery_Channel layer (e.g., WhatsApp/Twilio) SHALL map channel-specific inputs (e.g., WhatsApp button payloads) to Core_Layer Intents, and map Structured_Responses to channel-specific output formats (e.g., WhatsApp messages with emojis and buttons)
6. WHEN a new Delivery_Channel is added (e.g., mobile app, web app), THE Core_Layer SHALL require zero code changes — only new Adapter implementations for the Ports and a new Delivery_Channel mapping layer are needed
7. THE Bot SHALL organize source code into a `src/core/` directory for the Core_Layer (types, ports, business logic, bot engine) and a `src/adapters/` directory for Adapter implementations, enforcing the separation structurally
