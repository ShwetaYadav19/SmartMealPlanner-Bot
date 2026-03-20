# Implementation Tasks

## Tasks

- [x] 1. Fix signature-only ingredient overlap detection
  - [x] 1.1 Create `getSignatureIngredientNames` helper in `planGenerator.ts` that filters ingredients to only those with `category` in `{"protein", "lentils", "vegetables"}` and returns their lowercased names as a `Set<string>`
  - [x] 1.2 Update `hasIngredientOverlap` to use `getSignatureIngredientNames` instead of `getComponentIngredientNames` for the name-based overlap check (keep `hasProteinConflict` call unchanged)
  - [x] 1.3 Write property-based exploration test (`tst/core/ingredientOverlap.bugCondition.property.test.ts`) that generates component pairs sharing only pantry-staple ingredients and asserts `hasIngredientOverlap` returns false — run on UNFIXED code to confirm bug, expect failure
  - [x] 1.4 Write property-based preservation test (`tst/core/ingredientOverlap.preservation.property.test.ts`) that generates component pairs sharing at least one signature ingredient and asserts `hasIngredientOverlap` returns true — run on both unfixed and fixed code, expect pass on both
  - [x] 1.5 Verify exploration test passes on fixed code
- [x] 2. Add cross-meal gravy overlap reference for dinner
  - [x] 2.1 Add optional `lunchGravyRef?: MealComponent | null` parameter to `composeMeal` function signature
  - [x] 2.2 In `composeMeal` inline path (non-MealSelector), pass `lunchGravyRef` as an additional overlap reference when calling `pickComponent` for gravy — check overlap against both `base` and `lunchGravyRef`
  - [x] 2.3 In `composeMeal` MealSelector path, pass `lunchGravyRef` as an additional overlap reference when calling `mealSelector.applyIngredientOverlap` for gravy selection
  - [x] 2.4 In `generateWeeklyPlan`, extract the lunch gravy component after composing lunch and pass it as `lunchGravyRef` to the dinner `composeMeal` call
  - [x] 2.5 Write unit test verifying that dinner gravy avoids sharing a signature ingredient with lunch gravy when `lunchGravyRef` is provided
- [x] 3. Validate fix end-to-end
  - [x] 3.1 Run existing test suite (`vitest --run`) and verify no regressions
  - [x] 3.2 Verify `applyIngredientOverlap` in `mealSelector.ts` is completely unaffected (no code changes, existing tests pass)
