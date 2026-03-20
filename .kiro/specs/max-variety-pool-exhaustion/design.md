# Max Variety Pool Exhaustion Bugfix Design

## Overview

The meal plan generator uses sliding windows (3-day in `planGenerator.ts`, 2-day in `dishPreview.ts`, rule-based in `mealSelector.ts`) to avoid immediate repeats of components. However, these small windows allow components to repeat long before the available pool is exhausted. The fix replaces sliding-window history with cumulative "used set" tracking per category-slot, ensuring every component in a pool is used before any repeats. The used set resets only when the pool is fully exhausted.

## Glossary

- **Bug_Condition (C)**: A component is selected for a category-slot when unused components still exist in that category-slot's pool — i.e., the sliding window allowed a repeat prematurely.
- **Property (P)**: For any category-slot with pool size N, all N components are used before any component repeats. When pool size >= 7, the 7-day plan has 7 unique components for that category-slot.
- **Preservation**: Same-day dedup, ingredient overlap avoidance, protein conflict prevention, cuisine coherence, and progressive relaxation must all continue to work unchanged.
- **Category-Slot Pool**: The set of eligible MealComponents for a given `ComponentCategory` (base, gravy, dry_veggie, side) and slot (lunch, dinner) after preference filtering.
- **Used Set**: Cumulative set of component IDs already selected for a category-slot across the entire plan (replaces the sliding window).
- **Pool Exhaustion Reset**: When the used set size equals the pool size for a category-slot, the used set is cleared so the cycle can restart.

## Bug Details

### Bug Condition

The bug manifests when a 7-day plan is generated and the component pool for a category-slot has more items than the sliding window size. Components that fall outside the window become eligible again even though unused components remain in the pool. This causes premature repeats and poor variety.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { categorySlotPool: MealComponent[], windowSize: number, planLength: number }
  OUTPUT: boolean

  RETURN input.categorySlotPool.length > input.windowSize
         AND input.planLength > input.windowSize
         AND EXISTS day_i, day_j WHERE
           day_j > day_i + windowSize
           AND selectedComponent(day_i) == selectedComponent(day_j)
           AND EXISTS component IN categorySlotPool WHERE component NOT IN usedComponents(day_1..day_j)
END FUNCTION
```

### Examples

- **Gravy pool = 12, window = 3 (planGenerator)**: Gravy A picked on day 1 becomes eligible again on day 5. Gravy A is picked on day 5 while gravies B, C, D, E, F have never been used.
- **Dry veggie pool = 10, window = 2 (dishPreview)**: Dry veggie X picked on day 1 becomes eligible on day 4. X repeats on day 4 while 5 other dry veggies were never selected.
- **Base pool = 8, window = 3 (mealSelector)**: Base Y picked on day 1 re-enters the non-recent partition on day 5 and gets selected, skipping 4 unused bases.
- **Pool size = 5, plan length = 7**: With the fix, all 5 components are used on days 1–5, the used set resets, and days 6–7 pick from the full pool again — no premature repeats.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Same-day dedup: base, gravy, dry_veggie must differ between lunch and dinner on the same day (requirement 3.1)
- Ingredient overlap avoidance: gravy and dry_veggie should not share signature ingredients within a meal (requirement 3.2)
- Protein conflict prevention: no cross-group protein conflicts within a meal (requirement 3.3)
- Cuisine coherence: pure NI base pairs with pure NI components (requirement 3.4)
- Small pool graceful handling: pools smaller than 7 still compose valid meals, repeating only after exhaustion (requirement 3.5)
- Progressive relaxation: constraints relax gracefully rather than failing (requirement 3.6)
- Cross-meal overlap avoidance: dinner gravy differs from lunch gravy's signature ingredients (requirement 3.7)

**Scope:**
All constraint logic (same-day dedup, ingredient overlap, protein conflict, cuisine coherence) is unaffected. Only the mechanism that determines which components are "recent" (and thus deprioritized) changes — from a fixed-size sliding window to a cumulative used set with pool-exhaustion reset.

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is the sliding-window history approach in three locations:

1. **`generateWeeklyPlan` in `planGenerator.ts`**: The `history` object tracks only the last `RECENT_WINDOW = 3` component IDs per category-slot. After 3 days, earlier picks are shifted out and become fully eligible again. The `recentIds` passed to `pickComponent` / `composeMeal` only contains these 3 IDs.

2. **`buildPlanFromComponents` in `dishPreview.ts`**: Uses `WINDOW = 2` and `lunchHistory`/`dinnerHistory` arrays sliced to the last 2 days. Components from day 1 re-enter the pool on day 4.

3. **`MealSelector.applySlidingWindow` in `mealSelector.ts`**: Uses `rule.conditions.windowSize` (default 3) to slice history, creating the same limited-window problem when called via the rule-based `composeMeal` path.

In all three cases, the window is too small relative to pool sizes (often 8–15 components), so the system cycles through a small subset of the pool rather than exhausting it.

## Correctness Properties

Property 1: Bug Condition - Full Pool Exhaustion Before Repeats

_For any_ category-slot combination where the pool has N eligible components and N >= 7, the generated 7-day plan SHALL contain 7 unique component IDs for that category-slot (zero repeats). For pools where N < 7, repeats SHALL only occur after all N components have been used.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Existing Constraint Behavior Unchanged

_For any_ generated plan, same-day dedup (base/gravy/dry_veggie differ between lunch and dinner), ingredient overlap avoidance, protein conflict prevention, cuisine coherence, cross-meal overlap avoidance, and progressive relaxation SHALL continue to function identically to the pre-fix behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/core/planGenerator.ts`

**Function**: `generateWeeklyPlan`

**Specific Changes**:
1. **Replace sliding-window history with cumulative used sets**: Change `history` from tracking last `RECENT_WINDOW` IDs (with `.shift()`) to accumulating ALL used IDs per category-slot. Remove the `RECENT_WINDOW` constant and the `.shift()` trimming.
2. **Add pool-exhaustion reset**: Before building constraints for each day, check if the used set size for a category-slot equals the pool size. If so, clear the used set for that category-slot. This requires computing pool sizes per category-slot once before the day loop.
3. **Pass full used set as recentIds**: The `recentIds` in `ComposeMealConstraints` will contain all previously used IDs (not just last 3), causing `pickComponent` to prefer unused components via its existing progressive relaxation.

**File**: `src/core/dishPreview.ts`

**Function**: `buildPlanFromComponents`

**Specific Changes**:
1. **Replace sliding-window history with cumulative used sets**: Change `lunchHistory`/`dinnerHistory` from `string[][]` (per-day arrays sliced to `WINDOW`) to `Set<string>` per category-slot. Remove the `WINDOW` constant.
2. **Add pool-exhaustion reset**: Compute pool sizes per category-slot from the candidate pools. Before each day, check if used set size equals pool size and reset if so.
3. **Pass full used set as recentIds**: The `recentIds` in `ComposeMealConstraints` will contain all previously used IDs.

**File**: `src/core/mealSelector.ts`

**Function**: `applySlidingWindow`

**Specific Changes**:
1. **Ignore windowSize, use full history**: Instead of slicing history to `windowSize`, use ALL IDs from the history to build the `recentIds` set. This makes the method deprioritize all previously used components.
2. **Pool-exhaustion reset**: If all pool items are in `recentIds`, return the full pool (this already happens via the existing progressive relaxation: `if (nonRecent.length === 0) return pool`). No additional change needed for reset — the caller (`generateWeeklyPlan`) handles reset by clearing history.

**File**: `src/core/planGenerator.ts`

**Function**: `pickComponent` — No changes needed. It already handles `recentIds` correctly via progressive relaxation passes.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Generate plans with known pool sizes and check whether all components in a category-slot are used before any repeats. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Large Gravy Pool Test**: Generate a plan with 12 gravies available for lunch. Assert all 7 days have unique gravies. (will fail on unfixed code — sliding window of 3 allows repeats after day 4)
2. **DishPreview Path Test**: Call `buildPlanFromComponents` with 10 dry veggies for dinner. Assert 7 unique dry veggies. (will fail on unfixed code — window of 2 allows repeats after day 3)
3. **MealSelector Path Test**: Use rule-based `composeMeal` with `applySlidingWindow` and 8 bases. Assert 7 unique bases. (will fail on unfixed code)
4. **Small Pool Test**: Generate a plan with 5 gravies. Assert all 5 are used in the first 5 days, and days 6–7 reuse from the pool. (may partially pass on unfixed code)

**Expected Counterexamples**:
- Components repeat on day 4+ (planGenerator) or day 3+ (dishPreview) while unused components exist
- Possible causes: sliding window too small, history trimmed via `.shift()`, `windowSize` slicing

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  plan := generateWeeklyPlan_fixed(input)
  FOR EACH (category, slot) IN plan DO
    usedIds := collectUsedIds(plan, category, slot)
    poolSize := getPoolSize(input, category, slot)
    IF poolSize >= 7 THEN
      ASSERT uniqueCount(usedIds) == 7
    ELSE
      ASSERT firstRepeatIndex(usedIds) >= poolSize
    END IF
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL plan IN generateWeeklyPlan_fixed(input) DO
  FOR EACH day IN plan DO
    ASSERT day.lunch.gravy.id != day.dinner.gravy.id           // same-day dedup
    ASSERT day.lunch.base.id != day.dinner.base.id             // same-day dedup
    ASSERT day.lunch.dry_veggie.id != day.dinner.dry_veggie.id // same-day dedup
    ASSERT NOT hasIngredientOverlap(day.lunch.gravy, day.lunch.dry_veggie)  // ingredient overlap
    ASSERT NOT hasProteinConflict(day.lunch.gravy, day.lunch.dry_veggie)    // protein conflict
  END FOR
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for same-day dedup, ingredient overlap, and protein conflict constraints, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Same-Day Dedup Preservation**: Verify base, gravy, dry_veggie differ between lunch and dinner on each day
2. **Ingredient Overlap Preservation**: Verify gravy and dry_veggie don't share signature ingredients within a meal
3. **Protein Conflict Preservation**: Verify no cross-group protein conflicts within a meal
4. **Cuisine Coherence Preservation**: Verify pure NI base pairs with pure NI components
5. **Progressive Relaxation Preservation**: Verify plans still generate successfully with small pools

### Unit Tests

- Test that `generateWeeklyPlan` produces 7 unique gravies when pool >= 7
- Test that `buildPlanFromComponents` produces 7 unique dry veggies when pool >= 7
- Test pool-exhaustion reset: pool of 5 components produces 5 unique then restarts
- Test that `applySlidingWindow` deprioritizes all history, not just windowed history

### Property-Based Tests

- Generate random component pools (varying sizes 3–15) and verify max-variety property holds
- Generate random preference combinations and verify preservation constraints hold
- Test across many random seeds that pool exhaustion reset works correctly

### Integration Tests

- Full plan generation with realistic meal-components.json data, verifying variety metrics
- End-to-end `buildPlanFromComponents` with candidate dishes, verifying no premature repeats
- Rule-based path via MealSelector, verifying variety and constraint preservation
