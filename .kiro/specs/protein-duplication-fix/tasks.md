# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Dual-Protein Meal Pairing
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Construct component pools where both protein gravies (e.g., Egg Curry, Fish Curry, Tofu Curry) and protein dry_veggies (e.g., Egg Podimas, Chicken Pepper Fry, Paneer Bhurji) exist alongside veg alternatives (e.g., Sambar, Beans Poriyal)
  - Test that `composeMeal` produces a meal where at most one of gravy/dry_veggie is a protein dish when veg alternatives exist
  - Use `isProteinDish` logic inline (check ingredients against PROTEIN_KEYWORDS: chicken, chicken mince, fish, prawns, eggs, paneer, tofu) to classify components
  - Concrete failing cases to scope the property:
    - Pool with "Tofu Curry" (gravy) + "Paneer Bhurji" (dry_veggie) + veg alternatives — paneer/tofu not in current PROTEIN_GROUPS
    - Pool with "Egg Curry" (gravy) + "Egg Podimas" (dry_veggie) + veg alternatives — same protein group returns false from hasProteinConflict
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists by showing dual-protein meals are produced when veg alternatives are available)
  - Document counterexamples found (e.g., "composeMeal paired Egg Curry + Egg Podimas despite Beans Poriyal being available")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Dual-Protein Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-dual-protein pools:
    - Observe: veg-only pools (e.g., Sambar gravy + Beans Poriyal dry_veggie) compose meals normally
    - Observe: single-protein pools (e.g., Fish Curry gravy + Carrot Poriyal dry_veggie) compose balanced meals
    - Observe: veg gravy + protein dry_veggie (e.g., Moong Dal gravy + Chicken Fry dry_veggie) compose balanced meals
  - Write property-based tests using fast-check:
    - For all component pools where at most one of gravy/dry_veggie candidates contains protein ingredients, `composeMeal` produces a valid meal with all four categories (base, gravy, dry_veggie, side)
    - For all veg-only component pools, `composeMeal` produces a meal where no component is rejected by the protein balance rule
    - Ingredient overlap avoidance, sliding window, and same-day dedup constraints continue to function (pool is not empty after applying constraints)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Implement protein duplication fix

  - [x] 3.1 Add `isProteinDish` helper and expand `PROTEIN_GROUPS` in `src/core/planGenerator.ts`
    - Add `isProteinDish(component: MealComponent): boolean` function that checks if any ingredient name matches PROTEIN_KEYWORDS: `['chicken', 'chicken mince', 'fish', 'prawns', 'eggs', 'paneer', 'tofu']`
    - Add `paneer: 'dairy_protein'` and `tofu: 'plant_protein'` to the `PROTEIN_GROUPS` constant
    - _Bug_Condition: isBugCondition(gravy, dryVeggie) = isProteinDish(gravy) AND isProteinDish(dryVeggie)_
    - _Expected_Behavior: At most one of gravy/dry_veggie should be a protein dish_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Modify `pickComponent` in `src/core/planGenerator.ts` to support dual-protein prevention
    - Add a `dualProteinRef` parameter (MealComponent | null) to `pickComponent`
    - In Pass 1: skip candidates where `isProteinDish(candidate)` is true when `dualProteinRef` is a protein dish
    - Progressive relaxation: relax the dual-protein constraint in later passes (Pass 4+) so composition never fails
    - _Bug_Condition: When dualProteinRef is a protein dish, prefer non-protein candidates for the other slot_
    - _Preservation: When dualProteinRef is null or not a protein dish, behavior is unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 3.3 Modify `composeMeal` in `src/core/planGenerator.ts` to pass gravy as dual-protein reference
    - In the inline path (no MealSelector): pass the chosen gravy as `dualProteinRef` when calling `pickComponent` for dry_veggie
    - In the MealSelector path: after picking gravy, filter dry_veggie candidates to exclude protein dishes if gravy is a protein dish; fall back to unfiltered pool if no non-protein candidates remain
    - _Bug_Condition: isBugCondition(gravy, dryVeggie) = isProteinDish(gravy) AND isProteinDish(dryVeggie)_
    - _Expected_Behavior: composeMeal selects a non-protein dry_veggie when gravy is protein (and vice versa), with graceful fallback_
    - _Preservation: Veg+veg, protein+veg, veg+protein pairings unchanged; all other constraints still enforced_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Expand `PROTEIN_GROUPS` in `src/core/mealSelector.ts`
    - Add `paneer: 'dairy_protein'` and `tofu: 'plant_protein'` to the static `PROTEIN_GROUPS` map in `MealSelector`
    - _Preservation: Cross-group protein conflict detection continues to function, now also covering paneer and tofu_
    - _Requirements: 1.3, 3.4_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Dual-Protein Meal Pairing
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — no dual-protein meals when veg alternatives exist)
    - _Requirements: 2.1, 2.2_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Dual-Protein Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — veg+veg, protein+veg, veg+protein pairings unchanged)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite with `vitest --run`
  - Ensure all existing tests pass alongside the new property tests
  - Ensure no regressions in meal composition, constraint enforcement, or filter behavior
  - Ask the user if questions arise
