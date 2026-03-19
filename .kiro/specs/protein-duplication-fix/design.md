# Protein Duplication Fix — Bugfix Design

## Overview

The meal composer allows two protein-heavy dishes to be paired in the same composed meal (e.g., "Chicken Curry" gravy + "Fish Fry" dry_veggie, or "Tofu Curry" gravy + "Paneer Bhurji" dry_veggie). The `hasProteinConflict` function only prevents *cross-group* protein conflicts (chicken + fish) but does not enforce the fundamental rule: every composed meal should have at most one protein dish paired with one veg/fibre dish across gravy and dry_veggie.

The fix introduces a new `isProteinDish` helper that identifies protein-heavy components by checking their ingredients against an expanded protein keyword list (adding `paneer` and `tofu` to the existing groups). A new `hasDualProtein` check in `composeMeal` and `pickComponent` ensures that when the gravy is a protein dish, the dry_veggie must be a veg/fibre dish (and vice versa), with graceful fallback when no alternative exists.

## Glossary

- **Bug_Condition (C)**: Both the gravy and dry_veggie in a composed meal are protein dishes — i.e., both contain protein-group ingredients (chicken, fish, eggs, prawns, paneer, tofu)
- **Property (P)**: At most one of gravy/dry_veggie should be a protein dish; the other should be a veg/fibre dish
- **Preservation**: Existing behavior for veg+veg pairings, protein+veg pairings, veg+protein pairings, ingredient overlap avoidance, sliding window, same-day dedup, and all non-protein constraint logic must remain unchanged
- **`hasProteinConflict`**: Function in both `planGenerator.ts` and `mealSelector.ts` that currently checks for *cross-group* protein conflicts only (e.g., chicken vs fish)
- **`PROTEIN_GROUPS`**: Map of protein ingredient keywords to group names; currently covers chicken, fish, prawns, eggs — missing paneer and tofu
- **`composeMeal`**: Function in `planGenerator.ts` that assembles a ComposedMeal by picking one component per category (base, gravy, dry_veggie, side)
- **`pickComponent`**: Function in `planGenerator.ts` that selects a component from candidates with progressive constraint relaxation
- **`isProteinDish`**: New helper to determine if a component is protein-heavy by checking if any of its ingredients match expanded protein keywords

## Bug Details

### Bug Condition

The bug manifests when `composeMeal` pairs two protein dishes together in the gravy and dry_veggie slots. The existing `hasProteinConflict` function only detects *cross-group* conflicts (e.g., chicken gravy + fish dry_veggie) but allows:
- Same-group pairings (e.g., "Chicken Curry" + "Chicken Pepper Fry" — blocked by ingredient overlap, not protein logic)
- Untracked protein pairings (e.g., "Tofu Curry" + "Paneer Bhurji" — paneer/tofu not in PROTEIN_GROUPS)
- Same-group non-conflicting pairings (e.g., "Egg Curry" + "Egg Podimas" — same group returns false)

**Formal Specification:**
```
FUNCTION isBugCondition(gravy, dryVeggie)
  INPUT: gravy of type MealComponent, dryVeggie of type MealComponent
  OUTPUT: boolean

  RETURN isProteinDish(gravy) AND isProteinDish(dryVeggie)
END FUNCTION

FUNCTION isProteinDish(component)
  INPUT: component of type MealComponent
  OUTPUT: boolean

  PROTEIN_KEYWORDS := ['chicken', 'chicken mince', 'fish', 'prawns', 'eggs', 'paneer', 'tofu']
  FOR EACH ingredient IN component.ingredients DO
    FOR EACH keyword IN PROTEIN_KEYWORDS DO
      IF ingredient.name.toLowerCase().includes(keyword) THEN
        RETURN true
      END IF
    END FOR
  END FOR
  RETURN false
END FUNCTION
```

### Examples

- **"Chicken Curry" (gravy) + "Fish Fry" (dry_veggie)**: Both are protein dishes → bug condition met. Current `hasProteinConflict` catches this (cross-group), but the fix should also catch it via `isProteinDish`.
- **"Tofu Curry" (gravy, diet=veg) + "Paneer Bhurji" (dry_veggie, diet=veg)**: Both are protein dishes → bug condition met. Current code allows this because neither tofu nor paneer is in `PROTEIN_GROUPS`.
- **"Egg Curry" (gravy) + "Egg Podimas" (dry_veggie)**: Both are protein dishes, same group → bug condition met. Current `hasProteinConflict` returns `false` (shared group = compatible), and ingredient overlap catches the "eggs" overlap, but the protein balance rule should independently prevent this.
- **"Prawns Curry" (gravy) + "Chicken Pepper Fry" (dry_veggie)**: Both are protein dishes, different groups → bug condition met. Current `hasProteinConflict` catches this.
- **"Sambar" (gravy, veg) + "Beans Poriyal" (dry_veggie, veg)**: Neither is a protein dish → bug condition NOT met. Allowed.
- **"Fish Curry" (gravy) + "Carrot Poriyal" (dry_veggie, veg)**: One protein + one veg → bug condition NOT met. Allowed (balanced meal).
- **Edge case — all candidates are protein**: If the filtered pool for dry_veggie contains only protein dishes and the gravy is also protein, the system should fall back gracefully and allow the pairing rather than failing.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Veg gravy + veg dry_veggie pairings must continue to work (e.g., "Sambar" + "Beans Poriyal")
- Protein gravy + veg dry_veggie pairings must continue to work (e.g., "Fish Curry" + "Carrot Poriyal")
- Veg gravy + protein dry_veggie pairings must continue to work (e.g., "Moong Dal" + "Chicken Fry")
- Ingredient overlap avoidance must continue to function independently
- Sliding window variety constraints must continue to function
- Same-day dedup constraints must continue to function
- Cross-group protein conflict detection must continue to function (subsumed by the new rule)
- Pure-veg user pools (no protein dishes at all) must compose meals normally
- The `swapTomorrowLunch` function must also respect the new constraint

**Scope:**
All inputs where at most one of gravy/dry_veggie is a protein dish should be completely unaffected by this fix. This includes:
- All veg+veg pairings
- All protein+veg pairings
- All veg+protein pairings
- All breakfast selection logic
- All base and side selection logic

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Incomplete PROTEIN_GROUPS map**: The `PROTEIN_GROUPS` constant in both `planGenerator.ts` and `mealSelector.ts` only maps `chicken`, `chicken mince`, `fish`, `prawns`, and `eggs`. It does not include `paneer` or `tofu`, so dishes like "Tofu Curry", "Palak Paneer", "Kadhai Paneer", "Paneer Bhurji", "Tofu Bhurji", and "Chilly Paneer" are treated as having no protein group.

2. **Wrong abstraction — cross-group vs dual-protein**: `hasProteinConflict` checks whether two components have *different* protein groups (to avoid chicken+fish in one meal). But the real requirement is that a meal should not have *two protein dishes at all* — regardless of whether they're from the same group or different groups. The function returns `false` when both components share the same protein group (e.g., two chicken dishes), which is the opposite of what we need for nutritional balance.

3. **No `isProteinDish` concept**: The codebase lacks a simple boolean check for "is this component a protein dish?" — it only has group-level protein classification. The fix needs a simpler predicate that answers: "does this component contain any protein ingredient?"

4. **MealSelector path also affected**: The `composeMeal` function has two code paths — one using `MealSelector.applyConstraints` and one using inline `pickComponent`. Both paths use `hasProteinConflict` for cross-group checks but neither enforces the dual-protein prevention rule.

## Correctness Properties

Property 1: Bug Condition — No Dual-Protein Meals

_For any_ composed meal where both the gravy and dry_veggie are protein dishes (isProteinDish returns true for both), AND at least one non-protein alternative exists in the candidate pool for either slot, the fixed `composeMeal` function SHALL select a non-protein alternative for one of the slots, ensuring the meal has at most one protein component.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-Dual-Protein Behavior Unchanged

_For any_ composed meal where at most one of gravy/dry_veggie is a protein dish (or neither is), the fixed `composeMeal` function SHALL produce the same selection behavior as the original function, preserving all existing veg+veg, protein+veg, and veg+protein pairings, as well as all other constraint logic (ingredient overlap, sliding window, same-day dedup).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/core/planGenerator.ts`

**Functions**: `pickComponent`, `composeMeal`, and new `isProteinDish` helper

**Specific Changes**:

1. **Add `isProteinDish` helper function**: Create a new function that checks if a component contains any protein-group ingredient. Expand the keyword list to include `paneer` and `tofu` alongside the existing `chicken`, `chicken mince`, `fish`, `prawns`, `eggs`.

2. **Add `paneer` and `tofu` to `PROTEIN_GROUPS`**: Update the `PROTEIN_GROUPS` map in `planGenerator.ts` to include `paneer: 'dairy_protein'` and `tofu: 'plant_protein'` so that `getProteinGroups` and `hasProteinConflict` also cover these ingredients.

3. **Modify `pickComponent` to accept a `dualProteinRef` parameter**: When picking dry_veggie, pass the chosen gravy as `dualProteinRef`. In each pass of `pickComponent`, add a check: if `dualProteinRef` is a protein dish, skip candidates that are also protein dishes. This is relaxed in later passes (progressive relaxation).

4. **Modify `composeMeal` inline path**: In the non-MealSelector path, pass the chosen gravy as the `dualProteinRef` when calling `pickComponent` for dry_veggie.

5. **Modify `composeMeal` MealSelector path**: In the MealSelector path, after picking gravy, filter the dry_veggie candidates to exclude protein dishes if the gravy is a protein dish. Fall back to the unfiltered pool if no non-protein candidates remain.

**File**: `src/core/mealSelector.ts`

**Functions**: `PROTEIN_GROUPS` map, `applyIngredientOverlap`

**Specific Changes**:

6. **Add `paneer` and `tofu` to `PROTEIN_GROUPS`**: Update the static `PROTEIN_GROUPS` map in `MealSelector` to include `paneer: 'dairy_protein'` and `tofu: 'plant_protein'`.

7. **No changes to `hasProteinConflict` in MealSelector**: The cross-group conflict check remains useful as a secondary constraint. The primary dual-protein prevention is handled in `composeMeal`/`pickComponent`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that construct component pools with both protein gravies and protein dry_veggies, call `composeMeal`, and assert that the resulting meal has two protein dishes. Run these tests on the UNFIXED code to observe the bug in action.

**Test Cases**:
1. **Tofu+Paneer Pairing Test**: Pool with "Tofu Curry" (gravy) and "Paneer Bhurji" (dry_veggie) plus veg alternatives. On unfixed code, composeMeal may pair both protein dishes (will fail on unfixed code).
2. **Same-Group Protein Test**: Pool with "Egg Curry" (gravy) and "Egg Podimas" (dry_veggie) plus veg alternatives. On unfixed code, `hasProteinConflict` returns false for same-group (will fail on unfixed code).
3. **Cross-Group Protein Test**: Pool with "Chicken Curry" (gravy) and "Fish Fry" (dry_veggie). On unfixed code, `hasProteinConflict` catches this — but the test validates the new `isProteinDish` approach also catches it.
4. **All-Protein Pool Test**: Pool with only protein gravies and only protein dry_veggies. On unfixed code, composeMeal pairs them (expected — no alternative exists).

**Expected Counterexamples**:
- Tofu/paneer dishes are paired together because they're not in PROTEIN_GROUPS
- Same-group protein dishes (e.g., two egg dishes) are paired because hasProteinConflict returns false for shared groups
- Possible causes: incomplete PROTEIN_GROUPS, wrong conflict semantics

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (both gravy and dry_veggie are protein dishes) AND a non-protein alternative exists, the fixed function selects a non-protein alternative.

**Pseudocode:**
```
FOR ALL (components, slot, cuisine, constraints) WHERE
  composeMeal produces a meal with gravy G and dry_veggie D
  AND isProteinDish(G) AND isProteinDish(D)
DO
  pool := filterBySlotAndCuisine(components, slot, cuisine)
  vegGravies := pool.gravy.filter(c => NOT isProteinDish(c))
  vegDryVeggies := pool.dry_veggie.filter(c => NOT isProteinDish(c))
  ASSERT vegGravies.length == 0 AND vegDryVeggies.length == 0
    // Dual protein is only acceptable when no veg alternative exists
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (at most one protein dish), the fixed function produces the same selection behavior as the original function.

**Pseudocode:**
```
FOR ALL (components, slot, cuisine, constraints) WHERE
  NOT (isProteinDish(gravy) AND isProteinDish(dryVeggie))
DO
  ASSERT composeMeal_original(input) behaves equivalently to composeMeal_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random component pool configurations automatically
- It catches edge cases like pools with exactly one protein dish, pools with no protein dishes, and mixed pools
- It provides strong guarantees that veg+veg, protein+veg, and veg+protein pairings are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for non-dual-protein pools, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Veg-Only Pool Preservation**: Verify that pools with only veg components produce identical meals before and after fix
2. **Single-Protein Pool Preservation**: Verify that pools with exactly one protein gravy and all-veg dry_veggies produce identical selection behavior
3. **Constraint Interaction Preservation**: Verify that sliding window, same-day dedup, and ingredient overlap constraints continue to function alongside the new protein balance rule
4. **Pure-Veg User Preservation**: Verify that when diet="veg", no protein dishes exist in pool, and meals compose normally

### Unit Tests

- Test `isProteinDish` returns true for chicken, fish, egg, prawn, paneer, and tofu components
- Test `isProteinDish` returns false for veg components (dal, sambar, beans poriyal)
- Test `composeMeal` with mixed pool selects veg dry_veggie when gravy is protein
- Test `composeMeal` with all-protein pool falls back gracefully
- Test `pickComponent` skips protein candidates when dualProteinRef is protein

### Property-Based Tests

- Generate random component pools with varying protein/veg ratios and verify no dual-protein meals are produced (unless no alternative exists)
- Generate random veg-only pools and verify meal composition is unchanged from original behavior
- Generate random pools and verify all other constraints (ingredient overlap, sliding window, same-day dedup) still hold

### Integration Tests

- Test full `generateWeeklyPlan` with non_veg diet preference produces no dual-protein meals across 7 days
- Test `swapTomorrowLunch` respects the protein balance constraint
- Test that the MealSelector code path in `composeMeal` also enforces the constraint
