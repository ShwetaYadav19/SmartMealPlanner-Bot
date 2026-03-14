# Implementation Plan: WhatsApp Meal Planner Bot

## Overview

Build SmartMealPlanner-Bot on AWS Lambda + API Gateway + DynamoDB with a delivery-channel-agnostic core (hexagonal architecture). The core layer (`src/core/`) contains all business logic with zero dependencies on WhatsApp, Twilio, or AWS. Adapters (`src/adapters/`) implement port interfaces for specific technologies. The WhatsApp delivery layer (`src/intentMapper.ts`, `src/messageFormatter.ts`, `src/messages.ts`) maps between WhatsApp payloads and the core's intent/structured-response model. AWS account: `713170882602`. Implementation uses TypeScript with Vitest for testing and fast-check for property-based tests.

## Tasks

- [x] 1. Project setup and core interfaces
  - [x] 1.1 Initialize Node.js/TypeScript project with dependencies
    - Initialize `package.json` with TypeScript, Vitest, fast-check, aws-sdk v3 (DynamoDB), twilio, and esbuild
    - Create `tsconfig.json` with strict mode, ES2020 target, and Node module resolution
    - Create `vitest.config.ts` with fast-check default `{ numRuns: 100 }`
    - Add npm scripts: `build`, `test`, `deploy:dev`, `deploy:prod`
    - Create folder structure: `src/core/`, `src/adapters/`, `src/handlers/`, `data/`
    - _Requirements: 17.7, 19.7_

  - [x] 1.2 Define core types and port interfaces
    - Create `src/core/types.ts` with all shared interfaces: `Meal`, `Ingredient`, `MealFilter`, `ButtonOption`, `UserState`, `ConversationState`, `DayPlan`, `WeeklyPlan`, `GroceryItem`
    - Define `Intent` enum: `SELECT_CUISINE`, `SELECT_DIET`, `SELECT_MEAL_STYLE`, `GENERATE_PLAN`, `VIEW_WEEKLY_GROCERY`, `VIEW_TOMORROW_PLAN`, `VIEW_TOMORROW_GROCERY`, `SEND_MENU_TO_COOK`, `SWAP_LUNCH`, `SAVE_COOK_NUMBER`, `PROVIDE_COOK_NUMBER`, `UNKNOWN`
    - Define `UserIntent` interface: `{ intent: Intent; payload?: string }`
    - Define `ResponseType` enum for all structured response types (e.g., `WEEKLY_PLAN`, `MAIN_MENU`, `INVALID_INPUT`, etc.)
    - Define `BotResponse` interface: `{ type: ResponseType; data?: {...}; suggestedActions?: SuggestedAction[] }`
    - Define `BotResult` interface: `{ response: BotResponse; updatedState: UserState }`
    - Create `src/core/ports.ts` with port interfaces: `MealRepository`, `UserStateRepository`, `MessagingProvider`
    - Core types have zero imports from adapters, WhatsApp, Twilio, or AWS modules
    - _Requirements: 14.1, 15.2, 19.1, 19.2, 19.3, 19.4_

  - [x] 1.3 Create environment configuration module
    - Create `src/config.ts` that loads all config from Lambda environment variables: `STAGE`, `DYNAMODB_TABLE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_NUMBER`, and all `TWILIO_TEMPLATE_SID_*` variables
    - Include `AWS_ACCOUNT_ID` defaulting to `713170882602`
    - Export a typed `Config` object with validation for required variables
    - Template SID env vars are optional — the message catalog provides hardcoded defaults
    - _Requirements: 17.3, 18.4_

- [x] 2. Meal data layer
  - [x] 2.1 Create meals.json data file with all meals from prototype
    - Create `data/meals.json` with all meal entries from the existing `meals.js` prototype
    - Each entry must include: `id`, `name`, `cuisine`, `diet`, `style`, `slots`, and `ingredients` array
    - Follow ID convention: `{cuisine_prefix}-{slot_prefix}-{number}` (e.g., `ni-b-001`)
    - Ingredients embedded in each meal with `name`, `quantity`, and `category` fields
    - _Requirements: 15.1, 15.2_

  - [x] 2.2 Implement JsonMealRepository adapter
    - Create `src/adapters/jsonMealRepository.ts` implementing `MealRepository` port from `src/core/ports.ts`
    - Read from `data/meals.json` at startup, filter in-memory based on `MealFilter`
    - When cuisine filter is "both", return meals from both north_indian and south_indian
    - _Requirements: 15.1, 15.3, 4.2, 4.3, 19.2_

  - [x] 2.3 Write property test for meal data schema validity
    - **Property 14: Meal data schema validity**
    - Validate every entry in `data/meals.json` has all required fields with correct types and values
    - **Validates: Requirements 15.2**

- [x] 3. User state persistence layer
  - [x] 3.1 Implement DynamoDBUserStateRepository adapter
    - Create `src/adapters/dynamodbUserStateRepository.ts` implementing `UserStateRepository` port from `src/core/ports.ts`
    - Use AWS SDK v3 DynamoDB client, `phoneNumber` as partition key
    - Serialize/deserialize `WeeklyPlan` as a DynamoDB Map
    - Table name loaded from `Config.dynamodbTable`
    - AWS account: `713170882602`
    - _Requirements: 14.1, 14.2, 14.4, 19.2_

  - [x] 3.2 Write property test for user state round-trip
    - **Property 16: User state persistence round-trip**
    - Generate random valid `UserState` objects, save to DynamoDB (or mock), load by phone number, verify equivalence
    - **Validates: Requirements 14.2, 4.7, 10.3**

- [x] 4. Messaging provider adapter
  - [x] 4.1 Implement TwilioMessagingProvider adapter
    - Create `src/adapters/twilioMessagingProvider.ts` implementing `MessagingProvider` port from `src/core/ports.ts`
    - `sendButtonMessage` accepts an optional `templatePurpose` parameter
    - When `templatePurpose` is provided, resolve the Twilio Content Template SID via `getTemplateSid(purpose)` from `src/messages.ts` and pass it as `contentSid` in the Twilio API call
    - Fall back to inline button construction if no template SID is resolved
    - Send from the configured sender number (from `Config.twilioSenderNumber`)
    - _Requirements: 16.3, 18.3, 19.2_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Plan generation and grocery list
  - [x] 6.1 Implement PlanGenerator (core)
    - Create `src/core/planGenerator.ts` with `generateWeeklyPlan(meals, preferences)` function
    - Filter meals by preferences, group by slot compatibility (breakfast, lunch, dinner)
    - Use Fisher-Yates shuffle on each slot pool, assign sequentially to 7 days
    - Enforce no-repeat within same day across slots
    - Enforce no-repeat in same slot on consecutive days
    - When cuisine is "both", distribute North/South Indian meals across days and slots
    - Zero imports from adapters, WhatsApp, or AWS modules
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 19.1_

  - [x] 6.2 Write property tests for plan generation
    - **Property 4: Weekly plan structural invariants** — 7 days, 3 meals each, no same-day repeats, no consecutive-day same-slot repeats
    - **Property 5: Plan meals match user preferences** — every meal matches diet, style, and cuisine preferences
    - **Property 6: "Both" cuisine distribution** — plan contains at least one North Indian and one South Indian meal when preference is "both"
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5, 4.6**

  - [x] 6.3 Implement GroceryListGenerator (core)
    - Create `src/core/groceryListGenerator.ts` with `generateGroceryList(meals)` function
    - Aggregate all ingredients from input meals
    - Deduplicate ingredients by name (case-insensitive)
    - Group by category (vegetables, dairy, spices, grains, etc.)
    - Zero imports from adapters, WhatsApp, or AWS modules
    - _Requirements: 5.1, 7.1, 19.1_

  - [x] 6.4 Write property test for grocery list completeness
    - **Property 7: Grocery list ingredient completeness** — every ingredient from every input meal appears in the output list
    - **Validates: Requirements 5.1, 7.1**

  - [x] 6.5 Implement tomorrow's plan extraction (core)
    - Create `extractTomorrowPlan(weeklyPlan, weeklyPlanStartDate)` in `src/core/planGenerator.ts`
    - Compute tomorrow as current date + 1, map to day index (0=Monday through 6=Sunday)
    - Return the `DayPlan` at that index, or null if plan doesn't cover tomorrow
    - _Requirements: 6.1, 19.1_

  - [x] 6.6 Write property test for tomorrow extraction
    - **Property 8: Tomorrow's plan extraction correctness** — for any plan and day index 0–6, extraction returns the correct day's meals
    - **Validates: Requirements 6.1**

- [x] 7. Phone validation and swap logic
  - [x] 7.1 Implement phone number validation (core)
    - Create `src/core/phoneValidation.ts` with `validatePhoneNumber(input)` function
    - Validate against pattern `^\+\d{10,15}$`
    - Return `{ valid: boolean; normalized?: string }` 
    - _Requirements: 8.2, 8.3_

  - [x] 7.2 Write property test for phone number validation
    - **Property 9: Phone number validation** — accepts valid international format, rejects strings with letters, missing country code, or incorrect length
    - **Validates: Requirements 8.2, 8.3**

  - [x] 7.3 Implement swap lunch functionality (core)
    - Create `swapTomorrowLunch(weeklyPlan, tomorrowIndex, meals, preferences)` in `src/core/planGenerator.ts`
    - Select a replacement lunch from filtered meals that doesn't duplicate same-day breakfast/dinner or adjacent-day lunches
    - Update the plan in place and return old + new meal for confirmation message
    - _Requirements: 10.1, 10.2, 10.3, 19.1_

  - [x] 7.4 Write property test for swap lunch constraints
    - **Property 10: Swap lunch constraints** — replacement matches preferences, no same-day duplicates, no adjacent-day lunch duplicates
    - **Validates: Requirements 10.1, 10.2**

- [x] 8. Message catalog and formatting (WhatsApp delivery layer)
  - [x] 8.1 Create MessageCatalog (`src/messages.ts`)
    - Create `src/messages.ts` with all user-facing text strings as named exports
    - This file is WhatsApp-specific (emojis, WhatsApp formatting) — lives outside `src/core/`
    - A future mobile app would have its own message catalog or use structured response data directly
    - Group messages by context: onboarding, main menu, plan, grocery, cook, swap, reminders, errors
    - Use emojis and warm conversational tone in all messages
    - Support template variables via functions (e.g., `SWAP_CONFIRMATION(oldMeal, newMeal)`, `DAY_PLAN_HEADER(dayName)`)
    - Define `TemplatePurpose` type union: `'main_menu' | 'main_menu_button' | 'menu_more' | 'daily_reminder' | 'cook_options' | 'diet_selection' | 'cuisine_selection' | 'meal_style'`
    - Define `DEFAULT_TEMPLATE_SIDS` map with hardcoded Twilio Content Template SIDs:
      - `main_menu`: `HXe992435f98fde5249c641a135bb5dbd5`
      - `main_menu_button`: `HX050102bc4bf8f0f9a48473db7ea7152e`
      - `menu_more`: `HX7957efc7a19b2b9c8d2910ba15e6a2c5`
      - `daily_reminder`: `HX708fce9ebb60de686f73731e071aa8cb`
      - `cook_options`: `HX6eddbb2f0eb2678e3f505e3786dec4e8`
      - `diet_selection`: `HX5ad138d83501b0b1111e0a19a524dfd5`
      - `cuisine_selection`: `HX62d7649f7e38d88bec1b7d85b25ea83e`
      - `meal_style`: `HX26deeadd8ad7de0baf4568365e3da981`
    - Export `getTemplateSid(purpose: TemplatePurpose): string` that returns the env var override (`TWILIO_TEMPLATE_SID_*`) if set, otherwise the hardcoded default
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 16.6, 16.7, 18.1, 18.2, 18.4, 18.5_

  - [x] 8.2 Implement MessageFormatter using MessageCatalog
    - Create `src/messageFormatter.ts` with functions: `formatWeeklyPlan`, `formatDayPlan`, `formatGroceryList`, `formatCookMessage`
    - Import all text strings from `src/messages.ts` — no inline string literals in the formatter
    - `formatWeeklyPlan`: use `WEEKLY_PLAN_HEADER` and compose day-by-day layout with breakfast/lunch/dinner
    - `formatDayPlan`: use `DAY_PLAN_HEADER` and list tomorrow's 3 meals in a friendly format
    - `formatGroceryList`: use grocery header messages and group by ingredient category
    - `formatCookMessage`: use cook-specific messages with clear listing of each meal slot and dish
    - _Requirements: 16.1, 16.2, 16.4, 16.7, 4.8, 5.2, 6.2, 7.2, 9.2_

  - [x] 8.3 Write property test for formatted message content
    - **Property 15: Formatted messages contain expected content** — weekly plan output contains all 7 day names and 21 meal names; day plan contains 3 meal names; grocery list contains all ingredient names
    - **Validates: Requirements 4.8, 5.2, 6.2, 7.2, 9.2, 16.1**

  - [x] 8.4 Write property test for template SID resolution
    - **Property 19: Template SID resolution correctness** — for each `TemplatePurpose`, `getTemplateSid` returns the env var value when set, or the hardcoded default when not set; returned SID is always non-empty and matches `HX` + 32 hex chars format
    - **Validates: Requirements 18.3, 18.4, 18.5**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. BotEngine and intent mapper
  - [x] 10.1 Implement BotEngine core (intent-based conversation engine)
    - Create `src/core/botEngine.ts` with `processIntent(intent, userState, mealRepository)` function
    - Handle new user → return `ONBOARDING_CUISINE_PROMPT` with cuisine options as suggested actions
    - Handle `awaiting_cuisine` + `SELECT_CUISINE` → store cuisine, return `ONBOARDING_DIET_PROMPT`
    - Handle `awaiting_diet` + `SELECT_DIET` → store diet, return `ONBOARDING_STYLE_PROMPT`
    - Handle `awaiting_meal_style` + `SELECT_MEAL_STYLE` → mark onboarding complete, return `MAIN_MENU`
    - For all onboarding states + `UNKNOWN` intent → return `INVALID_INPUT` with current options re-prompted
    - BotEngine returns `BotResult` (structured response + updated state) — no formatted text, no WhatsApp knowledge
    - Zero imports from adapters, WhatsApp, Twilio, or AWS modules
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 19.1, 19.3, 19.4_

  - [x] 10.2 Implement main menu intents in BotEngine
    - Handle `main_menu` state with all action intents:
      - `GENERATE_PLAN` → call `generateWeeklyPlan`, store in state, return `WEEKLY_PLAN` response with plan data
      - `VIEW_WEEKLY_GROCERY` → generate from stored plan, return `WEEKLY_GROCERY_LIST` (or `NO_PLAN_ERROR`)
      - `VIEW_TOMORROW_PLAN` → extract from stored plan, return `TOMORROW_PLAN` (or `NO_PLAN_ERROR`)
      - `VIEW_TOMORROW_GROCERY` → extract tomorrow's meals, generate grocery list, return `TOMORROW_GROCERY_LIST` (or `NO_PLAN_ERROR`)
      - `SEND_MENU_TO_COOK` → return `COOK_MESSAGE_SENT` with cook data (or `NO_COOK_ERROR` / `NO_PLAN_ERROR`)
      - `SWAP_LUNCH` → swap tomorrow's lunch, return `SWAP_CONFIRMATION` with old/new meal (or `NO_PLAN_ERROR`)
      - `SAVE_COOK_NUMBER` → transition to `awaiting_cook_number`, return `COOK_NUMBER_PROMPT`
    - After each completed action, state returns to `main_menu` with `MAIN_MENU` suggested actions
    - `UNKNOWN` intent → return `INVALID_INPUT` with main menu options
    - _Requirements: 4.1, 4.7, 5.1, 5.3, 6.1, 6.3, 7.1, 7.3, 8.1, 9.1, 9.4, 9.5, 10.1, 10.5, 11.1, 11.2, 11.3, 19.3, 19.4_

  - [x] 10.3 Implement cook number intent in BotEngine
    - Handle `awaiting_cook_number` + `PROVIDE_COOK_NUMBER` → validate phone number, store in state, return `COOK_NUMBER_SAVED`
    - Invalid phone → return `INVALID_PHONE` response
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 19.3_

  - [x] 10.4 Implement WhatsApp IntentMapper
    - Create `src/intentMapper.ts` with `mapWhatsAppToIntent(buttonPayload, body, conversationState)` function
    - Map WhatsApp button payloads to core `UserIntent` objects (e.g., `"weekly_plan"` → `{ intent: GENERATE_PLAN }`)
    - Map free text in `awaiting_cook_number` to `PROVIDE_COOK_NUMBER` intent
    - Map unrecognized input to `UNKNOWN` intent
    - This is the WhatsApp-specific layer — a future mobile app would have its own intent mapper
    - _Requirements: 19.3, 19.5_

  - [x] 10.5 Implement WhatsApp ResponseFormatter
    - Create `src/messageFormatter.ts` with `formatBotResponse(response: BotResponse): FormattedMessage` function
    - Map each `ResponseType` to WhatsApp-formatted text using `src/messages.ts` (emojis, line breaks, warm language)
    - Map `ResponseType` to appropriate `templatePurpose` for Twilio Content Templates
    - Include `formatWeeklyPlan`, `formatDayPlan`, `formatGroceryList`, `formatCookMessage` helper functions
    - Import all text strings from `src/messages.ts` — no inline string literals
    - This is the WhatsApp-specific layer — a future mobile app would return structured JSON directly
    - _Requirements: 16.1, 16.2, 16.4, 16.7, 4.8, 5.2, 6.2, 7.2, 9.2, 19.5_

  - [x] 10.6 Write property tests for BotEngine
    - **Property 1: Onboarding preference persistence round-trip** — selections stored correctly in user state
    - **Property 2: Invalid input rejection during button-expected states** — UNKNOWN intent returns INVALID_INPUT with suggested actions
    - **Property 3: Onboarding flow completeness** — after all 3 intents, onboardingComplete=true, state=main_menu
    - **Property 11: Action completion returns to main menu** — after any action intent, state is main_menu
    - **Property 12: Returning user skips onboarding** — onboardingComplete=true users get MAIN_MENU response
    - **Property 17: Suggested actions for all selection points** — all selection responses have non-empty suggestedActions
    - **Validates: Requirements 1.1–1.4, 2.1–2.3, 3.1–3.4, 11.2, 11.3, 14.3, 16.3, 19.3, 19.4**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Webhook handler Lambda (thin wiring layer)
  - [x] 12.1 Implement WebhookHandler Lambda function
    - Create `src/handlers/webhookHandler.ts` with `webhookHandler(event: APIGatewayProxyEvent)` function
    - Parse URL-encoded form body from Twilio to extract `From`, `Body`, and button callback payload
    - Instantiate adapters: `DynamoDBUserStateRepository`, `JsonMealRepository`, `TwilioMessagingProvider`
    - Load user state → call `intentMapper.mapWhatsAppToIntent()` → call `botEngine.processIntent()` → call `messageFormatter.formatBotResponse()` → send via `MessagingProvider` → save state
    - This handler is a thin wiring layer — no business logic, just adapter instantiation and pipeline orchestration
    - Return `{ statusCode: 200, body: '' }` to Twilio
    - Handle malformed requests (missing From/Body) with 400 response
    - _Requirements: 14.3, 14.4, 19.5_

  - [x] 12.2 Write unit tests for webhook handler
    - Test Twilio request parsing (URL-encoded form body extraction)
    - Test handling of malformed requests (missing fields → 400)
    - Test end-to-end flow with mocked dependencies
    - _Requirements: 14.3_

- [x] 13. Reminder service Lambda handlers (thin wiring layer)
  - [x] 13.1 Implement Daily Reminder Lambda handler
    - Create `src/handlers/dailyReminderHandler.ts` with `dailyReminderHandler(event: ScheduledEvent)` function
    - Scan DynamoDB for users with `onboardingComplete: true`
    - For each user: call BotEngine to produce a `DAILY_REMINDER` or `EXPIRED_PLAN_PROMPT` response, format via `messageFormatter`, send via `MessagingProvider`
    - Includes button message with options: "View Grocery List", "Swap Lunch", "Send to Cook"
    - Send using configured sender number
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 19.5_

  - [x] 13.2 Implement Weekly Reminder Lambda handler
    - Create `src/handlers/weeklyReminderHandler.ts` with `weeklyReminderHandler(event: ScheduledEvent)` function
    - Scan DynamoDB for all users with `onboardingComplete: true`
    - For each user: produce a `WEEKLY_REMINDER` response, format and send
    - Includes button message with the option: "Generate Weekly Plan"
    - Send regardless of whether user has an active plan
    - Send using configured sender number
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 19.5_

  - [x] 13.3 Write property test for reminder targeting
    - **Property 13: Reminder targeting correctness** — daily reminder targets users with onboardingComplete=true AND plan covering tomorrow; weekly reminder targets all users with onboardingComplete=true
    - **Validates: Requirements 12.1, 12.4, 13.1**

  - [x] 13.4 Write unit tests for reminder handlers
    - Test daily reminder sends to correct users and skips incomplete onboarding
    - Test daily reminder sends "generate plan" prompt for expired plans
    - Test weekly reminder sends to all onboarded users regardless of plan status
    - Test reminder messages include correct buttons and emoji formatting
    - _Requirements: 12.1, 12.2, 12.4, 13.1, 13.2_

- [x] 14. Environment configuration and deployment scripts
  - [x] 14.1 Create deployment configuration and scripts
    - Create deployment scripts for `npm run deploy:dev` and `npm run deploy:prod`
    - Target AWS account `713170882602`
    - Configure environment-suffixed resource names: `MealPlannerUsers-{stage}`, `MealPlannerWebhook-{stage}`, `MealPlannerDailyReminder-{stage}`, `MealPlannerWeeklyReminder-{stage}`
    - Set Lambda environment variables per stage: `STAGE`, `DYNAMODB_TABLE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_NUMBER`, and all `TWILIO_TEMPLATE_SID_*` variables
    - Configure separate API Gateway stages (`/dev/webhook`, `/prod/webhook`)
    - EventBridge rules disabled by default in dev, enabled in prod
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 18.4_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The design uses TypeScript throughout — all implementation tasks use TypeScript
- Meal data from the existing prototype `meals.js` should be converted to `meals.json` format with embedded ingredients
- AWS account: `713170882602`
- **Hexagonal architecture**: Core logic in `src/core/` has zero dependencies on WhatsApp/Twilio/AWS. Adapters in `src/adapters/` implement port interfaces. A future mobile/web app only needs new adapters and a new intent mapper — zero changes to core.
- **Intent model**: BotEngine processes `UserIntent` objects (not WhatsApp payloads). The `intentMapper.ts` is the only WhatsApp-specific input layer.
- **Structured responses**: BotEngine returns `BotResponse` objects (not formatted text). The `messageFormatter.ts` is the only WhatsApp-specific output layer.
