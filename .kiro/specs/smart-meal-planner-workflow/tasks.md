# Tasks

## Task 1: Extend Core Types

- [x] 1.1 Add new conversation states to `ConversationState` union in `src/core/types.ts`: `change_plan_menu`, `few_meals_day_select`, `few_meals_slot_select`, `few_meals_alternatives`, `entire_plan_confirm`
- [x] 1.2 Add new intents to `Intent` enum: `CHANGE_PLAN`, `CHANGE_FEW_MEALS`, `CHANGE_ENTIRE_PLAN`, `SELECT_DAY`, `SELECT_MEAL_SLOT`, `SELECT_ALTERNATIVE`, `CHANGE_MORE_MEALS`, `DONE_CHANGING`, `ACCEPT_PLAN`, `RETRY_PLAN`, `ADHOC_MENU`
- [x] 1.3 Add new response types to `ResponseType` enum: `CHANGE_PLAN_MENU`, `FEW_MEALS_DAY_PROMPT`, `FEW_MEALS_SLOT_PROMPT`, `FEW_MEALS_ALTERNATIVES`, `FEW_MEALS_UPDATED`, `FEW_MEALS_NO_ALTERNATIVE`, `ENTIRE_PLAN_PREVIEW`, `ADHOC_MENU`
- [x] 1.4 Add new fields to `UserState` interface: `fewMealsSelectedDay?: number`, `fewMealsSelectedSlot?: 'breakfast' | 'lunch' | 'dinner'`, `fewMealsAlternatives?: (Meal | ComposedMeal)[]`, `previousWeeklyPlan?: WeeklyPlan`

## Task 2: Implement Plan Generator Extensions

- [x] 2.1 Implement `generateAlternatives` function in `src/core/planGenerator.ts` that generates up to 3 alternative meals for a given day/slot, respecting same-day dedup against the other slot's components
- [x] 2.2 Implement `regenerateWeeklyPlan` function in `src/core/planGenerator.ts` that collects meal/component IDs from the current plan, randomly excludes ~70%, and generates a new plan with those IDs in the excluded set
- [x] 2.3 Write unit tests for `generateAlternatives` in `tst/core/planGenerator.workflow.test.ts`
- [x] 2.4 Write unit tests for `regenerateWeeklyPlan` in `tst/core/planGenerator.workflow.test.ts`

## Task 3: Implement BotEngine Change Plan Handlers

- [x] 3.1 Implement `handleChangePlanMenu` handler in `src/core/botEngine.ts` that routes `CHANGE_FEW_MEALS`, `CHANGE_ENTIRE_PLAN`, and `CHANGE_PREFERENCE` intents to the correct sub-flows
- [x] 3.2 Implement `handleFewMealsDaySelect` handler that processes `SELECT_DAY` intent (payload 0–6), stores the day, and transitions to `few_meals_slot_select`
- [x] 3.3 Implement `handleFewMealsSlotSelect` handler that processes `SELECT_MEAL_SLOT` intent, calls `generateAlternatives`, stores alternatives, and transitions to `few_meals_alternatives`
- [x] 3.4 Implement `handleFewMealsAlternatives` handler that processes `SELECT_ALTERNATIVE` (updates plan), `CHANGE_MORE_MEALS` (loops to day select), and `DONE_CHANGING` (returns to main menu)
- [x] 3.5 Implement `handleEntirePlanConfirm` handler that processes `ACCEPT_PLAN` (saves plan, clears previousWeeklyPlan, returns to main menu) and `RETRY_PLAN` (regenerates again)
- [x] 3.6 Add `CHANGE_PLAN` intent handling in `handleMainMenu` to transition to `change_plan_menu` state
- [x] 3.7 Add Adhoc Menu handling: when onboarded user sends `ADHOC_MENU` intent from `main_menu`, return `ADHOC_MENU` response with weekly plan, tomorrow plan, and change preferences options
- [x] 3.8 Wire new state handlers into the `processIntent` switch/dispatch in `src/core/botEngine.ts`

## Task 4: Extend Intent Mapper

- [x] 4.1 Add button payload mappings in `src/intentMapper.ts` for: `change_plan`, `few_meals`, `entire_plan`, `accept_plan`, `retry_plan`, `change_more`, `done_changing`
- [x] 4.2 Add day selection mappings: `day_0` through `day_6` → `SELECT_DAY` with payload
- [x] 4.3 Add slot selection mappings: `slot_breakfast`, `slot_lunch`, `slot_dinner` → `SELECT_MEAL_SLOT` with payload
- [x] 4.4 Add alternative selection mappings: `alt_0`, `alt_1`, `alt_2` → `SELECT_ALTERNATIVE` with payload
- [x] 4.5 Add free-text "hi" and "menu" mapping to `ADHOC_MENU` intent for onboarded users in `main_menu` state
- [x] 4.6 Write unit tests for new intent mappings in `tst/intentMapper.workflow.test.ts`

## Task 5: Extend Message Formatter and Messages

- [x] 5.1 Add message templates in `src/messages.ts` for: Change Plan menu, day selection prompt, slot selection prompt, alternatives display, entire plan preview, adhoc menu, few meals updated, few meals no alternative
- [x] 5.2 Add formatting cases in `src/messageFormatter.ts` for new `ResponseType` values: `CHANGE_PLAN_MENU`, `FEW_MEALS_DAY_PROMPT`, `FEW_MEALS_SLOT_PROMPT`, `FEW_MEALS_ALTERNATIVES`, `FEW_MEALS_UPDATED`, `FEW_MEALS_NO_ALTERNATIVE`, `ENTIRE_PLAN_PREVIEW`, `ADHOC_MENU`
- [x] 5.3 Add a footer hint `Type "hi" to start a new conversation` to all terminal messages in `src/messageFormatter.ts` (weekly plan display, grocery list, meal swap confirmation, cook message sent, daily reminder, weekly reminder, few meals done, entire plan accept, adhoc menu responses)
- [x] 5.4 Write unit tests for new message formatting and footer hint presence in `tst/messageFormatter.workflow.test.ts`

## Task 6: Extend DynamoDB Adapter

- [x] 6.1 Update `serialize` and `deserialize` methods in `src/adapters/dynamodbUserStateRepository.ts` to handle new `UserState` fields: `fewMealsSelectedDay`, `fewMealsSelectedSlot`, `fewMealsAlternatives`, `previousWeeklyPlan`
- [x] 6.2 Write round-trip test for new fields in `tst/adapters/dynamodbUserState.workflow.test.ts`

## Task 7: Write Property-Based Tests

- [x] 7.1 [PBT] Property 1 — New user routing: *For any* phone number with no state and *for any* message, processIntent returns ONBOARDING_CUISINE_PROMPT `tst/core/botEngine.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 1: New user routing)
- [x] 7.2 [PBT] Property 3 — Invalid input re-prompting: *For any* active-flow state and UNKNOWN intent, response is INVALID_INPUT and state unchanged `tst/core/botEngine.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 3: Invalid input re-prompting)
- [x] 7.3 [PBT] Property 4 — Weekly plan structural invariant: *For any* valid preferences, generated plan has 7 days with B/L/D `tst/core/planGenerator.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 4: Weekly plan structural invariant)
- [x] 7.4 [PBT] Property 5 — Plan respects preferences: *For any* generated plan, all meals match user preferences `tst/core/planGenerator.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 5: Plan respects user preferences)
- [x] 7.5 [PBT] Property 6 — Plan display contains all meal names: *For any* plan, formatWeeklyPlan output contains every meal name `tst/messageFormatter.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 6: Plan display contains all meal names)
- [x] 7.6 [PBT] Property 10 — Few meals replacement updates plan correctly: *For any* alternative selection, plan is updated at correct day/slot and other entries unchanged `tst/core/botEngine.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 10: Few meals replacement updates plan correctly)
- [x] 7.7 [PBT] Property 12 — Entire plan regeneration exclusion: *For any* current plan, regenerated plan excludes ≥50% of original meal IDs `tst/core/planGenerator.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 12: Entire plan regeneration exclusion)
- [x] 7.8 [PBT] Property 15 — Preference change clears exclusions: *For any* preference change, excludedDishIds is empty and plan matches new prefs `tst/core/botEngine.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 15: Preference change clears exclusions)
- [x] 7.9 [PBT] Property 16 — Grocery list ingredient completeness: *For any* set of meals, grocery list contains every unique ingredient name `tst/core/groceryList.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 16: Grocery list ingredient completeness)
- [x] 7.10 [PBT] Property 20 — State persistence round-trip: *For any* UserState, serialize then deserialize produces equivalent state `tst/adapters/dynamodbUserState.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 20: State persistence round-trip)
- [x] 7.11 [PBT] Property 22 — Constraint pipeline never fails: *For any* preferences and non-empty pool, generation always returns a result `tst/core/planGenerator.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 22: Constraint pipeline never fails)
- [x] 7.12 [PBT] Property 23 — Same-day deduplication: *For any* generated DayPlan, gravy/dry_veggie IDs don't repeat across lunch and dinner `tst/core/planGenerator.workflow.property.test.ts` (Feature: smart-meal-planner-workflow, Property 23: Same-day deduplication)

## Task 8: Integration Testing

- [x] 8.1 Write end-to-end flow test for onboarding → dish preview → confirm → main menu → change plan → few meals → done in `tst/core/botEngine.workflow.test.ts`
- [x] 8.2 Write end-to-end flow test for main menu → change plan → entire plan → accept in `tst/core/botEngine.workflow.test.ts`
- [x] 8.3 Write end-to-end flow test for main menu → change plan → change preferences → dish preview → confirm in `tst/core/botEngine.workflow.test.ts`
- [x] 8.4 Write end-to-end flow test for adhoc menu routing in `tst/core/botEngine.workflow.test.ts`
