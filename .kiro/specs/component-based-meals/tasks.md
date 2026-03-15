# Implementation Plan: Component-Based Meals

## Overview

Transform lunch and dinner from single-dish `Meal` objects into composed meals built from individual `MealComponent` items. Each component belongs to a category (base, gravy, dry_veggie, side) and the plan generator assembles them into `ComposedMeal` objects at generation time. Breakfast remains unchanged. Updates touch types, repository, plan generator, grocery list generator, message formatter, and bot engine wiring.

## Tasks

- [x] 1. Define new types and update DayPlan
  - [x] 1.1 Add `ComponentCategory`, `MealComponent`, `ComposedMeal` types and `MealComponentFilter` to `src/core/types.ts`
    - Add `ComponentCategory` union type: `'base' | 'gravy' | 'dry_veggie' | 'side'`
    - Add `MealComponent` interface with id, name, category, cuisine, diet, style, slots, ingredients
    - Add `ComposedMeal` interface with components array, name (comma-separated), and ingredients (aggregated)
    - Add `MealComponentFilter` interface with optional cuisine, diet, style, slot, category fields
    - _Requirements: 1.1, 1.2, 1.3, 5.3, 5.4_
  - [x] 1.2 Update `DayPlan` type so `lunch` and `dinner` are `ComposedMeal`
    - Change `lunch: Meal` to `lunch: ComposedMeal` and `dinner: Meal` to `dinner: ComposedMeal`
    - Keep `breakfast: Meal` unchanged
    - _Requirements: 5.1, 5.2, 4.2_

- [x] 2. Create MealComponentRepository port and JSON adapter
  - [x] 2.1 Add `MealComponentRepository` interface to `src/core/ports.ts`
    - Add `getComponents(filter: MealComponentFilter): Promise<MealComponent[]>` method
    - _Requirements: 9.1_
  - [x] 2.2 Create `src/adapters/jsonMealComponentRepository.ts` mirroring `JsonMealRepository`
    - Load from `data/meal-components.json` at construction
    - Filter in-memory by cuisine (treat `'both'` as all), diet (treat `'both'` as all), style, slot, category
    - Throw descriptive error if file is missing or malformed
    - _Requirements: 9.2, 9.3, 9.4, 1.4_
  - [x] 2.3 Create initial `data/meal-components.json` seed data file
    - Include components across all four categories (base, gravy, dry_veggie, side) for both north_indian and south_indian cuisines
    - Use ID convention `{cuisine_prefix}-{category}-{nnn}` (e.g. `si-base-001`, `ni-gravy-003`)
    - Include enough components per category (≥8) to support 7-day plan generation with variety constraints
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 2.4 Write property test for repository filtering correctness
    - **Property 14: Repository filtering correctness**
    - **Validates: Requirements 9.1, 9.3, 9.4**
  - [ ]* 2.5 Write property test for component schema validity
    - **Property 1: Component schema validity**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 3. Implement meal composition logic in plan generator
  - [x] 3.1 Add `composeMeal` function to `src/core/planGenerator.ts`
    - Accept filtered component pool, slot, cuisine, and tracking sets (usedGravyIds, usedDryVeggieIds, usedKeyIngredients)
    - Pick one base (random), one gravy (respecting 3-day window, same-day dedup, key-ingredient overlap), one dry_veggie (respecting 3-day window, key-ingredient overlap), one side (random)
    - Assemble `ComposedMeal` with components array, comma-separated name, and flat-mapped ingredients
    - Implement progressive constraint relaxation on failure (relax key-ingredient overlap → relax 3-day window → relax same-day uniqueness)
    - Throw descriptive error if not enough components in a category
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_
  - [x] 3.2 Update `generateWeeklyPlan` to accept `MealComponent[]` and compose lunch/dinner
    - Add `components` parameter to function signature
    - Keep breakfast logic unchanged using existing `Meal[]` pool
    - For lunch and dinner, call `composeMeal` instead of `pickMealFromCursor`
    - Track gravy and dry_veggie sliding windows per slot across days
    - Track same-day gravy usage to prevent lunch/dinner gravy duplication
    - Use existing `buildCuisineSchedule()` to determine cuisine per slot per day
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1_
  - [ ]* 3.3 Write property test for composed meal structure
    - **Property 2: Composed meal structure — one component per category**
    - **Validates: Requirements 2.1**
  - [ ]* 3.4 Write property test for composition compatibility
    - **Property 3: Composition compatibility**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 8.2**
  - [ ]* 3.5 Write property test for ComposedMeal name and ingredients derivation
    - **Property 8: ComposedMeal name and ingredients derivation**
    - **Validates: Requirements 5.3, 5.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement variety constraints and swap logic
  - [x] 5.1 Update `swapTomorrowLunch` to compose a new `ComposedMeal` instead of picking a single `Meal`
    - Accept `MealComponent[]` instead of `Meal[]`
    - Compose a new `ComposedMeal` applying same composition rules (cuisine, diet, style, slot)
    - Avoid reusing the gravy from the current lunch being swapped
    - Return old `ComposedMeal.name` and new `ComposedMeal.name` in swap result
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 5.2 Write property test for gravy and dry_veggie sliding-window variety
    - **Property 4: Gravy and dry_veggie sliding-window variety**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 5.3 Write property test for same-day gravy uniqueness
    - **Property 5: Same-day gravy uniqueness**
    - **Validates: Requirements 3.3**
  - [ ]* 5.4 Write property test for key-ingredient non-overlap
    - **Property 6: Key-ingredient non-overlap within a composed meal**
    - **Validates: Requirements 3.4**
  - [ ]* 5.5 Write property test for swap produces a different composed meal
    - **Property 12: Swap produces a different composed meal**
    - **Validates: Requirements 8.1, 8.3**
  - [ ]* 5.6 Write property test for swap returns correct meal names
    - **Property 13: Swap returns correct meal names**
    - **Validates: Requirements 8.4**

- [x] 6. Update grocery list generator for composed meals
  - [x] 6.1 Update `generateGroceryList` in `src/core/groceryListGenerator.ts` to handle `ComposedMeal`
    - Accept `(Meal | ComposedMeal)[]` or extract a flat `Ingredient[]` from the plan
    - Read `ComposedMeal.ingredients` the same way as `Meal.ingredients`
    - Continue handling breakfast `Meal` objects with existing logic
    - Maintain existing deduplication and quantity-combining behavior
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ]* 6.2 Write property test for grocery list completeness from composed meals
    - **Property 9: Grocery list completeness from composed meals**
    - **Validates: Requirements 6.1, 6.3**
  - [ ]* 6.3 Write property test for grocery list deduplication
    - **Property 10: Grocery list deduplication**
    - **Validates: Requirements 6.2**

- [x] 7. Update message formatter for composed meals
  - [x] 7.1 Update `formatWeeklyPlan`, `formatDayPlan`, `formatCookMessage`, and `formatDayPlanBody` in `src/messageFormatter.ts`
    - Read `day.lunch.name` and `day.dinner.name` which are now `ComposedMeal.name` (comma-separated component names)
    - Update type signatures to use the updated `DayPlan` with `ComposedMeal`
    - Breakfast formatting remains unchanged
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 7.2 Write property test for formatted output contains composed meal component names
    - **Property 11: Formatted output contains composed meal component names**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Wire everything together in bot engine and handle backward compatibility
  - [x] 9.1 Update `handleMainMenu` in `src/core/botEngine.ts` to use `MealComponentRepository`
    - Add `MealComponentRepository` parameter to `handleMainMenu` and `processIntent`
    - In `GENERATE_PLAN`: fetch components via `mealComponentRepository.getComponents()`, pass to updated `generateWeeklyPlan`
    - In `VIEW_WEEKLY_GROCERY`: extract ingredients from `ComposedMeal.ingredients` for lunch/dinner alongside `Meal.ingredients` for breakfast
    - In `VIEW_TOMORROW_GROCERY`: same ingredient extraction update
    - In `SWAP_LUNCH`: fetch components and pass to updated `swapTomorrowLunch`
    - _Requirements: 2.1, 6.1, 8.1, 8.2_
  - [x] 9.2 Update handler entry points to instantiate `JsonMealComponentRepository` and pass to bot engine
    - Update webhook handler and reminder handlers to create `JsonMealComponentRepository` alongside `JsonMealRepository`
    - _Requirements: 9.2_
  - [x] 9.3 Add backward compatibility for legacy serialized plans
    - When loading `UserState.weeklyPlan`, check if `lunch` has a `components` array
    - If not (legacy single-dish format), treat as loadable without error
    - Set flag to prompt user to regenerate via `EXPIRED_PLAN_PROMPT`
    - _Requirements: 10.1, 10.2_
  - [ ]* 9.4 Write property test for breakfast remains a single Meal
    - **Property 7: Breakfast remains a single Meal**
    - **Validates: Requirements 4.1**
  - [ ]* 9.5 Write property test for legacy plan backward compatibility
    - **Property 15: Legacy plan backward compatibility**
    - **Validates: Requirements 10.1, 10.2**

- [x] 10. Update existing tests to work with new DayPlan type
  - [x] 10.1 Fix existing tests that construct `DayPlan` with single-dish lunch/dinner
    - Update test fixtures in `tst/core/planGenerator.test.ts`, `tst/core/planGenerator.property.test.ts`, `tst/core/planGenerator.swap.property.test.ts`
    - Update test fixtures in `tst/core/groceryListGenerator.test.ts`, `tst/core/groceryListGenerator.property.test.ts`
    - Update test fixtures in `tst/messageFormatter.test.ts`, `tst/messageFormatter.property.test.ts`
    - Update test fixtures in `tst/core/botEngine.test.ts`, `tst/core/botEngine.property.test.ts`
    - Ensure all existing tests pass with the updated `DayPlan` type
    - _Requirements: 4.2, 5.1, 5.2_

- [x] 11. Update esbuild configuration for new adapter
  - [x] 11.1 Ensure `data/meal-components.json` is bundled/copied alongside `data/meals.json` in the build
    - Update build command or deploy workflow if needed to include the new data file
    - Verify the new adapter resolves the file path correctly in Lambda environment
    - _Requirements: 1.4, 9.2_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The existing `pickMealFromCursor` logic for breakfast remains untouched
- The `composeMeal` function follows the same progressive constraint relaxation pattern as the existing `pickMealFromCursor`
