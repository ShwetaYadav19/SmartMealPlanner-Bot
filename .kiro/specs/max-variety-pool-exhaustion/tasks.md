# Tasks

## Task 1: Exploratory Bug Condition Test

Write a property-based test that demonstrates the bug on the UNFIXED code. This test should FAIL on the current code, confirming the root cause.

- [x] 1.1 Create `tst/core/maxVariety.bugCondition.property.test.ts` with a property test that generates a weekly plan using `generateWeeklyPlan` with a component pool where at least one category-slot has >= 7 items, and asserts that all 7 days have unique component IDs for that category-slot. Run on unfixed code to observe failure (premature repeats due to sliding window).
  - **Property**: Property 1: Bug Condition - Full Pool Exhaustion Before Repeats

## Task 2: Implement Fix in `generateWeeklyPlan`

Replace the sliding-window history with cumulative used sets and pool-exhaustion reset in `planGenerator.ts`.

- [x] 2.1 In `generateWeeklyPlan`, remove the `RECENT_WINDOW` constant and the `history[slot][cat].shift()` trimming logic. Change `history` to accumulate all used IDs per category-slot without eviction.
- [x] 2.2 Before the day loop, compute pool sizes per category-slot by grouping `components` by category and slot (filtered by cuisine/diet as appropriate). Store as a `Map<string, number>` keyed by `${category}-${slot}`.
- [x] 2.3 At the start of each day iteration, for each category-slot, check if `history[slot][cat].length >= poolSize`. If so, clear the array (`history[slot][cat] = []`) to reset the used set for that category-slot.
- [x] 2.4 Verify that `lunchConstraints` and `dinnerConstraints` already pass `history[slot][cat]` as `recentIds` — no change needed there since the history now contains all used IDs.

## Task 3: Implement Fix in `buildPlanFromComponents`

Replace the sliding-window history with cumulative used sets and pool-exhaustion reset in `dishPreview.ts`.

- [x] 3.1 In `buildPlanFromComponents`, remove the `WINDOW` constant. Change `lunchHistory` and `dinnerHistory` from `Record<ComponentCategory, string[][]>` to `Record<ComponentCategory, string[]>` (flat arrays accumulating all used IDs).
- [x] 3.2 Compute pool sizes per category-slot from the `candidates.lunchComponents` and `candidates.dinnerComponents` objects before the day loop.
- [x] 3.3 At the start of each day iteration, for each category-slot, check if the used array length >= pool size. If so, clear the array to reset.
- [x] 3.4 Update the constraint-building code to use the flat used arrays directly as `recentIds` (instead of slicing the last `WINDOW` days from a 2D array).

## Task 4: Implement Fix in `MealSelector.applySlidingWindow`

Modify `applySlidingWindow` to use full history instead of windowed history.

- [x] 4.1 In `applySlidingWindow`, remove the `windowSize` slicing (`ids.slice(-windowSize)`). Instead, add ALL IDs from `context.history` to the `recentIds` set. The existing progressive relaxation (`if (nonRecent.length === 0) return pool`) already handles pool exhaustion correctly.

## Task 5: Fix Checking Property Test

Write a property-based test that verifies the fix works correctly — all components in a category-slot are used before any repeats.

- [x] 5.1 Create `tst/core/maxVariety.fixCheck.property.test.ts` with a property test that generates weekly plans with varying pool sizes (7–15 per category-slot) and asserts that for pools >= 7, all 7 days have unique component IDs per category-slot. For pools < 7, assert the first repeat index equals the pool size.
  - **Property**: Property 1: Bug Condition - Full Pool Exhaustion Before Repeats

## Task 6: Preservation Property Test

Write a property-based test that verifies existing constraints are preserved after the fix.

- [x] 6.1 Create `tst/core/maxVariety.preservation.property.test.ts` with a property test that generates weekly plans and asserts: (a) same-day dedup holds for base/gravy/dry_veggie between lunch and dinner, (b) no ingredient overlap between gravy and dry_veggie within a meal, (c) no cross-group protein conflicts within a meal, (d) plans generate successfully without errors for various pool sizes.
  - **Property**: Property 2: Preservation - Existing Constraint Behavior Unchanged

## Task 7: Unit Tests

Write targeted unit tests for edge cases and specific scenarios.

- [x] 7.1 Add unit tests in `tst/core/maxVariety.unit.test.ts` covering: (a) pool of exactly 7 produces 7 unique components, (b) pool of 5 produces 5 unique then resets, (c) pool of 1 repeats every day without error, (d) `applySlidingWindow` with full history deprioritizes all used components.
