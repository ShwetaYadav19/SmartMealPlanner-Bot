# Cuisine Array Crossover Bugfix Design

## Overview

The `cuisine` field on `Meal` and `MealComponent` is currently a single string (`"north_indian" | "south_indian"`). To support crossover dishes, a separate whitelist-based filter (`applySouthIndianCrossover`, `DEFAULT_SI_WHITELIST`, `matchesWhitelist()`) and a `south-indian-crossover` rule in `meal-selection-rules.json` are maintained in parallel. This is fragile and error-prone.

The fix changes `cuisine` from a single string to an array of strings (`("north_indian" | "south_indian")[]`). Items that work across both cuisines are tagged `["south_indian", "north_indian"]`. The crossover filter, whitelist constant, and whitelist-matching function are removed entirely. The `applyCuisineFilter` method is updated to check whether the user's preferred cuisine is present in the item's cuisine array. This makes the data the single source of truth.

## Glossary

- **Bug_Condition (C)**: A new dish is added to data files but not to both `DEFAULT_SI_WHITELIST` and the rule's `whitelist`, causing silent exclusion for `cuisine: "both"` users
- **Property (P)**: The cuisine filter uses the item's own cuisine array to determine inclusion — no external whitelist needed
- **Preservation**: All non-cuisine filter rules (diet, style, excluded-dishes, sliding-window, same-day-dedup, ingredient-overlap, cuisine-alternation) continue to work identically
- **`applyCuisineFilter`**: The method in `MealSelector` that filters items by cuisine preference
- **`applySouthIndianCrossover`**: The method in `MealSelector` that filters south_indian items against a whitelist when cuisine is `"both"` — to be removed
- **`DEFAULT_SI_WHITELIST`**: The hardcoded constant in `mealSelector.ts` listing crossover dish names — to be removed
- **`matchesWhitelist()`**: The helper function performing case-insensitive name matching against the whitelist — to be removed

## Bug Details

### Bug Condition

The bug manifests when a dish is added to or removed from `meals.json` or `meal-components.json` without updating both the `DEFAULT_SI_WHITELIST` constant in `mealSelector.ts` and the `whitelist` array in the `south-indian-crossover` rule in `meal-selection-rules.json`. The system silently excludes valid crossover dishes or retains stale whitelist entries.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { item: Meal | MealComponent, userCuisine: string }
  OUTPUT: boolean

  RETURN input.userCuisine == "both"
         AND input.item.cuisine == "south_indian"
         AND input.item.name NOT IN DEFAULT_SI_WHITELIST
         AND input.item SHOULD be a crossover dish
END FUNCTION
```

### Examples

- Adding "Pongal" to `meals.json` with `cuisine: "south_indian"` but forgetting to add it to `DEFAULT_SI_WHITELIST` → Pongal is excluded for `cuisine: "both"` users even though it's a popular crossover dish
- Renaming "Sambar" to "Sambhar" in data but not updating the whitelist → the old entry never matches, the new name is excluded
- Removing "Egg Appam" from data but leaving it in the whitelist → stale entry, no functional impact but maintenance debt
- `DEFAULT_SI_WHITELIST` in code has 27 entries but the rule's `whitelist` in JSON has a different set → inconsistent filtering depending on code path

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Diet filter, diet fallback, style filter, style fallback rules continue to work identically
- Excluded-dishes filter continues to remove items by ID
- Sliding-window, same-day-dedup, ingredient-overlap, cuisine-alternation constraints are unaffected
- Repository adapters (`JsonMealRepository`, `JsonMealComponentRepository`) continue to load and serve data
- `getCandidatePool`, `applyConstraints`, `applySlidingWindow`, `applySameDayDedup`, `applyIngredientOverlap`, `getCuisineForDay` methods are unaffected in logic
- Mouse/button interactions, plan generation, grocery list generation are unaffected

**Scope:**
All inputs that do NOT involve cuisine filtering logic should be completely unaffected by this fix. This includes:
- Diet preference filtering
- Style preference filtering
- Excluded dish filtering
- All constraint and limit rules
- Plan generation and composition logic

## Hypothesized Root Cause

Based on the bug description, the root cause is an architectural issue:

1. **Dual Source of Truth**: The crossover dish set is defined in two places — `DEFAULT_SI_WHITELIST` in code and `whitelist` in the JSON rule — which can diverge silently

2. **Name-Based Matching**: The `matchesWhitelist()` function uses case-insensitive string matching against dish names, which breaks when dishes are renamed

3. **Manual Maintenance Burden**: Every data file change requires a corresponding whitelist update in both locations, which is easy to forget

4. **Single-Value Cuisine Field**: The `cuisine` field being a single string forces the system to use an external whitelist to express "this dish belongs to multiple cuisines"

## Correctness Properties

Property 1: Bug Condition - Cuisine Array Inclusion

_For any_ item where `cuisine` is an array containing a value, and the user's cuisine preference matches that value or is `"both"`, the fixed `applyCuisineFilter` SHALL include that item in the result without consulting any external whitelist.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Cuisine Filter Behavior

_For any_ input processed by diet-filter, diet-fallback, style-filter, style-fallback, excluded-dishes, sliding-window, same-day-dedup, ingredient-overlap, or cuisine-alternation rules, the fixed code SHALL produce exactly the same result as the original code, preserving all existing non-cuisine filtering behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/core/types.ts`

**Types**: `Meal`, `MealComponent`

**Specific Changes**:
1. **Change `cuisine` field type**: From `'north_indian' | 'south_indian'` to `('north_indian' | 'south_indian')[]` on both `Meal` and `MealComponent` interfaces

---

**File**: `src/core/mealSelector.ts`

**Functions**: `applyCuisineFilter`, `applySouthIndianCrossover`, `matchesWhitelist`, `DEFAULT_SI_WHITELIST`

**Specific Changes**:
2. **Remove `DEFAULT_SI_WHITELIST`**: Delete the constant array
3. **Remove `matchesWhitelist()`**: Delete the helper function
4. **Remove `applySouthIndianCrossover()`**: Delete the method and all call sites in `applyFilterRule`, `applyMealFilters`, `applyComponentFilters`
5. **Update `applyCuisineFilter()`**: Change from `item.cuisine === pref` to `item.cuisine.includes(pref)` — when pref is `"both"`, pass all through (unchanged); when pref is a single value, check if the item's cuisine array contains that value

---

**File**: `data/meal-selection-rules.json`

**Rule**: `south-indian-crossover`

**Specific Changes**:
6. **Remove the `south-indian-crossover` rule**: Delete the entire rule object from the JSON array (reducing from 11 to 10 rules)

---

**File**: `data/meals.json`

**Specific Changes**:
7. **Convert `cuisine` values to arrays**: Change every `"cuisine": "north_indian"` to `"cuisine": ["north_indian"]` and every `"cuisine": "south_indian"` to `"cuisine": ["south_indian"]`
8. **Tag whitelist items as dual-cuisine**: Items currently on the whitelist (Idli, Dosa, Rava Dosa, Masala Dosa, Uttapam, Sambar, Sambhar, Idli with Sambar, Medu Vada with Sambar, Ragi Dosa, Egg Dosa, Egg Appam, Steamed Rice, Jeera Rice, Lemon Rice, Chapati, Rasam, Egg Curry, Chicken Pepper Fry, Egg Podimas, Fish Fry, Prawn Fry, Curd, Pickle, Papad, Onion Raita, Cucumber Salad) get `"cuisine": ["south_indian", "north_indian"]`

---

**File**: `data/meal-components.json`

**Specific Changes**:
9. **Convert `cuisine` values to arrays**: Same transformation as meals.json — single strings become single-element arrays, whitelist items become `["south_indian", "north_indian"]`

---

**File**: `src/adapters/jsonMealRepository.ts`

**Function**: `getMeals`

**Specific Changes**:
10. **Update cuisine filter logic**: Change `meal.cuisine !== filter.cuisine` to `!meal.cuisine.includes(filter.cuisine)` to support array-based cuisine field

---

**File**: `src/adapters/jsonMealComponentRepository.ts`

**Function**: `getComponents`

**Specific Changes**:
11. **Update cuisine filter logic**: Change `component.cuisine !== filter.cuisine` to `!component.cuisine.includes(filter.cuisine)` to support array-based cuisine field

---

**Files**: Test files

**Specific Changes**:
12. **Update `tst/adapters/mealDataSchema.test.ts`**: Change cuisine validation from checking single string to checking array of valid cuisine strings
13. **Update `tst/adapters/mealDataSufficiency.test.ts`**: Change `m.cuisine === cuisine` to `m.cuisine.includes(cuisine)` and `c.cuisine === cuisine` to `c.cuisine.includes(cuisine)`
14. **Update `tst/core/mealSelector.property.test.ts`**: Remove `southIndianCrossoverRule` and Property 16 tests; update `arbMealComponent` and `arbMeal` to generate cuisine as arrays; update cuisine assertions from `===` to `.includes()`
15. **Update `tst/core/mealSelector.integration.test.ts`**: Remove south-indian-crossover whitelist tests; update rule count from 11 to 10; update cuisine assertions
16. **Update `tst/core/backwardCompat.property.test.ts`**: Remove south-indian-crossover references; update rule count from 11 to 10; adjust backward compat logic for array-based cuisine

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the whitelist fragility on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the whitelist fragility BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that add a synthetic south_indian item NOT on the whitelist and verify it gets excluded for `cuisine: "both"` users. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Missing Whitelist Entry Test**: Add a south_indian item named "Pongal" (not on whitelist), filter with `cuisine: "both"` → item excluded (will fail on unfixed code, demonstrating the bug)
2. **Renamed Dish Test**: Add a south_indian item named "Sambhar Rice" (not exact whitelist match), filter with `cuisine: "both"` → item excluded despite being a valid crossover
3. **Whitelist Divergence Test**: Use a rule with a different whitelist than `DEFAULT_SI_WHITELIST` → different results depending on code path

**Expected Counterexamples**:
- Items not on the whitelist are silently excluded for `cuisine: "both"` users
- Possible causes: name-based matching, dual source of truth, manual maintenance

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := applyCuisineFilter_fixed(input)
  ASSERT expectedBehavior(result)
  -- item with cuisine array containing user's preference is included
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT applyCuisineFilter_original(input) = applyCuisineFilter_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random cuisine/diet/style combinations to verify filtering
- It catches edge cases in array-based cuisine matching
- It provides strong guarantees that non-cuisine rules are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for diet, style, excluded-dishes, and constraint rules, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Single Cuisine Preservation**: Verify `cuisine: "north_indian"` returns only items with `"north_indian"` in their cuisine array — same items as before
2. **Both Cuisine Preservation**: Verify `cuisine: "both"` returns the same set of items (all north_indian + whitelisted south_indian, now tagged as dual-cuisine)
3. **Diet Filter Preservation**: Verify diet filtering is completely unchanged
4. **Constraint Rule Preservation**: Verify sliding-window, same-day-dedup, ingredient-overlap produce identical results

### Unit Tests

- Test `applyCuisineFilter` with single-element cuisine arrays
- Test `applyCuisineFilter` with dual-cuisine arrays
- Test `applyCuisineFilter` with `"both"` preference passes all items
- Test that `applySouthIndianCrossover`, `DEFAULT_SI_WHITELIST`, `matchesWhitelist` no longer exist
- Test repository adapter cuisine filtering with array-based cuisine field

### Property-Based Tests

- Generate random items with array-based cuisine fields and verify `applyCuisineFilter` includes items whose array contains the preference
- Generate random preference combinations and verify non-cuisine rules produce identical results
- Generate random pools and verify the fixed cuisine filter is equivalent to the old cuisine-filter + crossover combination for items that were on the whitelist

### Integration Tests

- Test full `getCandidatePool` flow with real data files after migration
- Test that rule count is 10 (not 11) after removing south-indian-crossover
- Test that all cuisine/diet/style combinations produce non-empty candidate pools
