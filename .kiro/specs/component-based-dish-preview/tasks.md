# Implementation Plan: Component-Based Dish Preview

## Overview

Transform the dish preview flow for lunches and dinners from composed-meal level to component level. Users will see and exclude individual MealComponents (base, gravy, dry_veggie, side) instead of pre-composed meals. Meals are composed from remaining components only at confirmation time. Breakfasts remain unchanged. Includes style fallback (health → regular) and diet fallback (non_veg includes veg).

## Tasks

- [x] 1. Update types and data structures
  - [x] 1.1 Add `ComponentsByCategory` interface and update `CandidateDishes` in `src/core/types.ts`
    - Add `ComponentsByCategory` interface with `base`, `gravy`, `dry_veggie`, `side` arrays of `MealComponent`
    - Replace `lunches: ComposedMeal[]` and `dinners: ComposedMeal[]` with `lunchComponents: ComponentsByCategory` and `dinnerComponents: ComponentsByCategory`
    - Keep `breakfasts: Meal[]` unchanged
    - _Requirements: 6.1, 6.2_

  - [x] 1.2 Add `removedComponentName` and `removedComponentCategory` to `BotResponse.data`
    - Add optional `removedComponentName?: string` and `removedComponentCategory?: string` fields
    - _Requirements: 3.3, 7.3_

- [x] 2. Rewrite `dishPreview.ts` core functions
  - [x] 2.1 Rewrite `generateCandidateDishes` to return component pools instead of composed meals
    - Fetch breakfasts as today (unchanged)
    - For each slot (lunch, dinner) and each category, fetch components matching user preferences
    - Filter out excluded IDs
    - Implement diet fallback: if `diet === 'non_veg'`, also fetch and merge veg components
    - Implement style fallback: if `style === 'health'` and health components < 2 in a category, fetch regular components and append "(Regular)" suffix to their names
    - Return `CandidateDishes` with `lunchComponents` and `dinnerComponents` as `ComponentsByCategory`
    - _Requirements: 1.4, 1.5, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 2.2 Write property test: generated candidates match preferences and respect exclusion list
    - **Property 1: Generated candidates match preferences and respect exclusion list**
    - **Validates: Requirements 1.4, 1.5**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [ ]* 2.3 Write property test: style fallback includes regular components with "(Regular)" suffix
    - **Property 10: Style fallback includes regular components with "(Regular)" suffix**
    - **Validates: Requirements 8.1, 8.2**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [ ]* 2.4 Write property test: diet fallback rules
    - **Property 11: Diet fallback rules**
    - **Validates: Requirements 9.1, 9.3, 9.4**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [x] 2.5 Implement `removeComponent` function (replaces `removeDishAndReplace` for lunch/dinner)
    - Pure function: search all categories in `lunchComponents` and `dinnerComponents` for the component ID
    - If removing would leave a category empty, return `null` (guard)
    - Otherwise return updated `CandidateDishes` with component filtered out, plus removed component name and category
    - _Requirements: 2.1, 3.1, 3.2, 3.4_

  - [ ]* 2.6 Write property test: component removal produces correct state transition
    - **Property 2: Component removal produces correct state transition**
    - **Validates: Requirements 2.1, 3.2**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [ ]* 2.7 Write property test: removal confirmation contains component name and category
    - **Property 3: Removal confirmation contains component name and category**
    - **Validates: Requirements 3.3, 7.3**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [x] 2.8 Implement `removeBreakfast` function (extracted from old `removeDishAndReplace`)
    - Handles breakfast removal only: find replacement from pool, unchanged behavior
    - _Requirements: 5.2, 5.3_

  - [ ]* 2.9 Write property test: breakfast removal replaces with a different breakfast
    - **Property 8: Breakfast removal replaces with a different breakfast**
    - **Validates: Requirements 5.2**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [x] 2.10 Implement `hasMinimumComponents` function (replaces `hasMinimumDishes`)
    - Return `true` if every category in both `lunchComponents` and `dinnerComponents` has ≥1 component, and `breakfasts` has ≥1 entry
    - _Requirements: 3.4, 4.1_

  - [x] 2.11 Implement `buildPlanFromComponents` function (replaces `buildPlanFromCandidates`)
    - For each of 7 days, call `composeMeal` for lunch and dinner using component pools
    - Sort health-style components first in each category before passing to `composeMeal`
    - Wrap breakfasts with reuse if fewer than 7
    - Return `WeeklyPlan`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.3, 8.4_

  - [ ]* 2.12 Write property test: confirmed plan structure with no excluded components
    - **Property 6: Confirmed plan structure with no excluded components**
    - **Validates: Requirements 4.1, 4.2, 4.4**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [ ]* 2.13 Write property test: plan always produces 7 days even with limited component pools
    - **Property 9: Plan always produces 7 days even with limited component pools**
    - **Validates: Requirements 4.5**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [ ]* 2.14 Write property test: CandidateDishes serialization round trip
    - **Property 7: CandidateDishes serialization round trip**
    - **Validates: Requirements 6.3**
    - Test file: `tst/core/dishPreview.property.test.ts`

  - [ ]* 2.15 Write unit tests for dishPreview functions
    - Test specific examples of component removal, empty category guard, style fallback, diet fallback
    - Test `hasMinimumComponents` edge cases
    - Test `buildPlanFromComponents` with known inputs
    - Test file: `tst/core/dishPreview.test.ts`
    - _Requirements: 1.4, 1.5, 2.1, 3.2, 3.4, 4.1, 8.1, 9.1_

- [x] 3. Checkpoint — Verify dishPreview module
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update `botEngine.ts` handleDishPreview
  - [x] 4.1 Update `handleDishPreview` to use new component-based functions
    - On `REMOVE_DISH`: check if breakfast ID first (delegate to `removeBreakfast`), otherwise delegate to `removeComponent`
    - On success: add ID to `excludedDishIds`, return `DISH_REMOVED` with `removedComponentName` and `removedComponentCategory`
    - On failure (category empty): return `DISH_PREVIEW_EMPTY_ERROR`
    - On `CONFIRM_DISHES`: call `buildPlanFromComponents` instead of `buildPlanFromCandidates`
    - Update imports to use new function names
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2_

  - [x] 4.2 Update all other `generateCandidateDishes` call sites in `botEngine.ts`
    - Update `handleAwaitingCookNumberOnboarding`, `handleMainMenu`, `handleMoreOptions`, `handleAwaitingPreferenceDiet` to work with new `CandidateDishes` shape
    - _Requirements: 1.1, 6.1_

  - [ ]* 4.3 Write property test: preference change clears exclusion list
    - **Property 12: Preference change clears exclusion list**
    - **Validates: Requirements 2.3**
    - Test file: `tst/core/botEngine.property.test.ts`

- [x] 5. Update message formatting
  - [x] 5.1 Rewrite `formatDishPreviewMessage` in `src/messages.ts` for component-level preview
    - Group components under category headings: `*🍚 Base*`, `*🍛 Gravy*`, `*🥗 Dry Veggie*`, `*🥣 Side*`
    - Show breakfast section unchanged
    - Show lunch components and dinner components grouped by category
    - Components with "(Regular)" suffix displayed as-is
    - _Requirements: 1.1, 1.3, 7.1, 7.2, 8.2_

  - [x] 5.2 Add `COMPONENT_REMOVED_CONFIRMATION` message template in `src/messages.ts`
    - Format: `Removed *{name}* from {category} 🔄`
    - _Requirements: 3.3, 7.3_

  - [x] 5.3 Update `formatBotResponse` in `src/messageFormatter.ts` for component-based buttons and messages
    - Update `DISH_PREVIEW` case: generate one `remove_dish_{componentId}` button per component across all categories, plus breakfast buttons, plus confirm button
    - Update `DISH_REMOVED` case: use `COMPONENT_REMOVED_CONFIRMATION` with component name and category
    - Update `DISH_PREVIEW_EMPTY_ERROR` case: use component-based buttons
    - _Requirements: 1.2, 5.1, 7.3, 7.4_

  - [ ]* 5.4 Write property test: formatted preview contains category headings with correct component names
    - **Property 4: Formatted preview contains category headings with correct component names**
    - **Validates: Requirements 1.3, 7.1, 7.2**
    - Test file: `tst/messageFormatter.property.test.ts`

  - [ ]* 5.5 Write property test: formatted response has one button per component plus confirm button
    - **Property 5: Formatted response has one button per component plus confirm button**
    - **Validates: Requirements 1.2, 7.4**
    - Test file: `tst/messageFormatter.property.test.ts`

  - [ ]* 5.6 Write unit tests for updated message formatting
    - Test `formatDishPreviewMessage` with known component inputs
    - Test `COMPONENT_REMOVED_CONFIRMATION` output
    - Test button generation for component-based preview
    - Test file: `tst/messageFormatter.test.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6. Checkpoint — Verify formatting and botEngine integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Verify serialization and existing tests
  - [x] 7.1 Verify DynamoDB serialization works with new `CandidateDishes` structure
    - Confirm `ComponentsByCategory` serializes naturally to JSON (plain object with array values)
    - No changes needed to `dynamodbUserStateRepository.ts` — verify existing serialize/deserialize handles the new shape
    - Update any existing tests that reference old `CandidateDishes` shape (`lunches`/`dinners` → `lunchComponents`/`dinnerComponents`)
    - _Requirements: 6.3_

  - [x] 7.2 Update existing `botEngine` tests to use new `CandidateDishes` shape
    - Update test fixtures in `tst/core/botEngine.test.ts` and `tst/core/botEngine.property.test.ts`
    - Update any assertions that reference `lunches`/`dinners` fields
    - _Requirements: 6.1_

  - [x] 7.3 Verify `intentMapper.ts` requires no changes
    - Confirm `remove_dish_` prefix pattern works for component IDs (e.g., `si-base-001`)
    - Confirm `REMOVE_DISH` intent is reused — no new intent needed
    - _Requirements: 1.2_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation tasks use TypeScript
- `intentMapper.ts` requires no changes (task 7.3 is verification only)
- `composeMeal` from `planGenerator.ts` is reused as-is for deferred meal composition
