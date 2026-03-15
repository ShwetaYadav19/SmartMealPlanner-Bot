# Implementation Plan: Enhanced Meal Planner UX

## Overview

Incrementally implement six UX enhancements to the WhatsApp meal planner bot: dish preview flow, cook number onboarding, auto plan generation, restructured menus, on-demand grocery list, and preference/cook editing. Each task builds on the previous, ending with full integration.

## Tasks

- [x] 1. Extend types and interfaces
  - [x] 1.1 Add new conversation states, intents, response types, and UserState fields to `src/core/types.ts`
    - Add `awaiting_cook_number_onboarding`, `dish_preview`, `more_options`, `awaiting_preference_cuisine`, `awaiting_preference_diet` to `ConversationState`
    - Add `SKIP_COOK_NUMBER`, `REMOVE_DISH`, `CONFIRM_DISHES`, `MORE_OPTIONS`, `CHANGE_PREFERENCE`, `CHANGE_COOK_NUMBER` to `Intent` enum
    - Add `COOK_NUMBER_ONBOARDING_PROMPT`, `DISH_PREVIEW`, `DISH_REMOVED`, `DISH_PREVIEW_EMPTY_ERROR`, `MORE_OPTIONS_MENU` to `ResponseType` enum
    - Add `excludedDishIds`, `candidateDishes`, `isPreferenceChange` to `UserState`
    - Add `CandidateDishes` interface with `breakfasts: Meal[]`, `lunches: ComposedMeal[]`, `dinners: ComposedMeal[]`
    - Extend `BotResponse.data` with `candidateDishes`, `removedDishName`, `replacementDishName`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 5.1, 6.1_

  - [ ]* 1.2 Write unit tests for new type definitions
    - Verify new enum values exist and are distinct
    - Verify `CandidateDishes` structure compiles correctly
    - _Requirements: 1.1, 2.1, 5.1, 6.1_

- [x] 2. Implement dish preview module
  - [x] 2.1 Create `src/core/dishPreview.ts` with candidate generation, removal, and plan building
    - Implement `generateCandidateDishes(deps, preferences, excludedDishIds)` — generates 7 breakfasts, 7 lunches, 7 dinners filtered by preferences and exclusions
    - Implement `removeDishAndReplace(candidates, dishId, deps, preferences, excludedDishIds)` — removes a dish, replaces it from the pool, returns updated candidates or null if no replacement
    - Implement `hasMinimumDishes(candidates)` — checks at least one dish per meal slot
    - Implement `buildPlanFromCandidates(candidates)` — converts confirmed candidates into a `WeeklyPlan`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.2 Write property test: Dish removal preserves candidate count with replacement
    - **Property 2: Dish removal preserves candidate count with a different replacement**
    - Generate random `CandidateDishes` and pick a random dish to remove, assert count preserved and dish changed
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 2.3 Write property test: Excluded dishes never appear in candidates
    - **Property 3: Excluded dishes never appear in candidate generation**
    - Generate random exclusion lists and preferences, generate candidates, assert no excluded ID appears
    - **Validates: Requirements 1.5**

  - [ ]* 2.4 Write property test: Confirmed candidates produce matching plan
    - **Property 4: Confirmed candidates produce matching weekly plan**
    - Generate random `CandidateDishes`, build plan, assert each day matches by index
    - **Validates: Requirements 1.6**

  - [ ]* 2.5 Write unit tests for dish preview edge cases
    - Test empty dish pool scenario
    - Test all dishes excluded scenario
    - Test removal with no replacement available returns null
    - _Requirements: 1.4, 1.5, 1.6_

- [x] 3. Checkpoint - Ensure dish preview module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update intent mapper for new states and button payloads
  - [x] 4.1 Add new intent mappings to `src/intentMapper.ts`
    - Map `skip_cook` button in `awaiting_cook_number_onboarding` state → `SKIP_COOK_NUMBER`
    - Map `remove_dish_{id}` button in `dish_preview` state → `REMOVE_DISH` with dish ID as payload
    - Map `confirm_dishes` button in `dish_preview` state → `CONFIRM_DISHES`
    - Map `more_options` button in `main_menu` state → `MORE_OPTIONS`
    - Map `weekly_plan` button in `more_options` state → `GENERATE_PLAN`
    - Map `weekly_grocery` button in `more_options` state → `VIEW_WEEKLY_GROCERY`
    - Map `change_preference` button in `more_options` state → `CHANGE_PREFERENCE`
    - Map `change_cook_number` button in `more_options` state → `CHANGE_COOK_NUMBER`
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 5.1, 6.1_

  - [ ]* 4.2 Write unit tests for new intent mappings
    - Test each new button payload maps to the correct intent in the correct state
    - Test unknown payloads in new states return `UNKNOWN`
    - _Requirements: 1.2, 2.1, 5.1, 6.1_

- [x] 5. Implement bot engine state handlers
  - [x] 5.1 Add cook number onboarding handler to `src/core/botEngine.ts`
    - Implement `handleAwaitingCookNumberOnboarding` — validates phone or handles skip, triggers dish preview generation, transitions to `dish_preview`
    - Modify `handleAwaitingMealStyle` to transition to `awaiting_cook_number_onboarding` instead of completing onboarding
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1_

  - [ ]* 5.2 Write property test: Meal style transitions to cook number onboarding
    - **Property 5: Meal style selection transitions to cook number onboarding**
    - Generate random valid meal style values, process intent, assert state transition
    - **Validates: Requirements 2.1**

  - [ ]* 5.3 Write property test: Cook number onboarding validates phone correctly
    - **Property 6: Cook number onboarding validates phone input correctly**
    - Generate random strings (valid and invalid phone formats), process intent, assert correct behavior
    - **Validates: Requirements 2.3, 2.5**

  - [ ]* 5.4 Write property test: Skip advances without saving cook number
    - **Property 7: Skipping cook number advances without saving**
    - Generate random user states in `awaiting_cook_number_onboarding`, process SKIP, assert `cookPhoneNumber` unchanged
    - **Validates: Requirements 2.4**

  - [ ]* 5.5 Write property test: Onboarding completion auto-triggers dish preview
    - **Property 8: Onboarding completion auto-triggers dish preview**
    - Generate random preference combinations, complete onboarding, assert `dish_preview` state with populated candidates
    - **Validates: Requirements 3.1, 3.2**

  - [x] 5.6 Add dish preview handler to `src/core/botEngine.ts`
    - Implement `handleDishPreview` — handles `REMOVE_DISH` (replace + re-present), `CONFIRM_DISHES` (build plan + transition to `main_menu`), and empty-dishes edge case
    - On confirm: build plan from candidates, set `onboardingComplete` if needed, transition to `main_menu`, include grocery hint in response
    - On remove: call `removeDishAndReplace`, update `excludedDishIds`, re-present preview; if empty, return `DISH_PREVIEW_EMPTY_ERROR`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 3.2_

  - [ ]* 5.7 Write property test: Plan generation always goes through dish preview
    - **Property 1: Plan generation always goes through dish preview**
    - Generate random onboarded user states with valid preferences, process `GENERATE_PLAN`, assert response type is `DISH_PREVIEW`
    - **Validates: Requirements 1.1**

  - [x] 5.8 Add more options handler to `src/core/botEngine.ts`
    - Implement `handleMoreOptions` — routes `GENERATE_PLAN` (→ dish preview), `VIEW_WEEKLY_GROCERY`, `CHANGE_PREFERENCE` (→ `awaiting_preference_cuisine`, clear `excludedDishIds`), `CHANGE_COOK_NUMBER` (→ `awaiting_cook_number`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.9 Add preference change handlers to `src/core/botEngine.ts`
    - Implement `handleAwaitingPreferenceCuisine` and `handleAwaitingPreferenceDiet` — reuse existing onboarding logic with `isPreferenceChange` flag
    - On diet selection complete: clear `excludedDishIds`, regenerate candidates, transition to `dish_preview`
    - _Requirements: 6.4, 6.6_

  - [ ]* 5.10 Write property test: Preference change clears exclusion list
    - **Property 12: Preference change clears the exclusion list**
    - Generate random user states with non-empty `excludedDishIds`, process `CHANGE_PREFERENCE`, assert exclusion list cleared
    - **Validates: Requirements 6.4**

- [x] 6. Update main menu handler for restructured menu
  - [x] 6.1 Modify existing `main_menu` handler in `src/core/botEngine.ts`
    - Route `MORE_OPTIONS` intent → return `MORE_OPTIONS_MENU` response, transition to `more_options`
    - Route `SEND_MENU_TO_COOK` → if no cook number saved, return `NO_COOK_ERROR` with prompt to save
    - Ensure `GENERATE_PLAN` from main menu goes through dish preview flow
    - Ensure existing `VIEW_TOMORROW_PLAN`, `VIEW_TOMORROW_GROCERY`, `SEND_MENU_TO_COOK` continue to work
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 6.2 Write unit tests for restructured main menu
    - Test each main menu button routes correctly
    - Test `SEND_MENU_TO_COOK` with no cook number returns error prompt
    - Test backward compatibility with existing actions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 7. Checkpoint - Ensure all bot engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update message formatter and message catalog
  - [x] 8.1 Add new message templates to `src/messages.ts`
    - Add cook number onboarding prompt message with Skip button text
    - Add dish preview message template (list of dishes with remove buttons)
    - Add dish removed confirmation message with replacement info
    - Add dish preview empty error message
    - Add more options menu message
    - Add weekly plan grocery hint text (e.g., "Tap 'More Options' to view the weekly grocery list")
    - _Requirements: 1.2, 2.1, 2.2, 3.3, 4.1, 6.1_

  - [x] 8.2 Update `src/messageFormatter.ts` with new response type formatting
    - Format `COOK_NUMBER_ONBOARDING_PROMPT` — text prompt with Skip button
    - Format `DISH_PREVIEW` — list dishes with remove buttons and a confirm button
    - Format `DISH_REMOVED` — confirmation with updated preview
    - Format `DISH_PREVIEW_EMPTY_ERROR` — error message re-presenting original preview
    - Format `MORE_OPTIONS_MENU` — text with 4 more-options buttons
    - Update `WEEKLY_PLAN` formatting to include grocery hint text and use restructured main menu buttons
    - Update `MAIN_MENU` formatting to use new 4-button layout: "Tomorrow's Meal Plan", "Tomorrow's Grocery", "Send Menu to Cook", "More Options"
    - _Requirements: 1.2, 2.1, 2.2, 3.3, 4.1, 4.2, 4.3, 5.1, 6.1_

  - [ ]* 8.3 Write property test: Weekly plan message includes grocery hint
    - **Property 9: Weekly plan message includes grocery hint text**
    - Generate random `WeeklyPlan` data, format `WEEKLY_PLAN` response, assert hint text present
    - **Validates: Requirements 3.3, 4.1**

  - [ ]* 8.4 Write property test: Weekly plan uses restructured menu without grocery
    - **Property 10: Weekly plan response uses restructured main menu without grocery**
    - Generate random `WEEKLY_PLAN` responses, assert button set and no grocery data
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 8.5 Write property test: Menu responses contain correct button sets
    - **Property 11: Menu responses contain the correct button sets**
    - Generate random `MAIN_MENU` and `MORE_OPTIONS_MENU` responses, assert exact button sets
    - **Validates: Requirements 5.1, 6.1**

  - [ ]* 8.6 Write unit tests for message formatter
    - Test each new response type produces correct text and button structure
    - Test main menu buttons match the 4-button layout
    - Test more options buttons match the 4-button layout
    - _Requirements: 1.2, 2.1, 4.1, 5.1, 6.1_

- [x] 9. Wire everything together and integration
  - [x] 9.1 Update webhook handler to pass new states through the pipeline
    - Ensure `webhookHandler` correctly handles new conversation states and passes them to `processIntent`
    - Ensure new response types are formatted and sent via the messaging provider
    - Ensure `candidateDishes` and `excludedDishIds` are persisted in user state saves
    - _Requirements: 1.1, 2.1, 3.1, 5.1, 6.1_

  - [ ]* 9.2 Write integration tests for full conversation flows
    - Test full onboarding flow: cuisine → diet → style → cook number → dish preview → confirm → main menu
    - Test onboarding with skip cook number: cuisine → diet → style → skip → dish preview → confirm → main menu
    - Test dish removal flow: preview → remove dish → updated preview → confirm
    - Test more options flow: main menu → more options → weekly plan → dish preview → confirm
    - Test preference change flow: more options → change preference → cuisine → diet → dish preview → confirm
    - _Requirements: 1.1, 1.3, 2.1, 2.4, 3.1, 5.5, 6.4_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing hexagonal architecture is preserved — all new logic goes in `src/core/`
