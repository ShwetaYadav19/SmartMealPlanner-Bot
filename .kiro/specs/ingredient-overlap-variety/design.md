# Ingredient Overlap Variety — Bugfix Design

## Overview

The inline `hasIngredientOverlap` function in `planGenerator.ts` compares ALL ingredient names between two components, causing common pantry staples (Onion, Oil, Turmeric Powder, Cumin Seeds, etc.) to trigger false-positive overlaps. This eliminates most `dry_veggie` candidates in Pass 1 of `pickComponent`, forcing fallback to Pass 2 (which relaxes overlap entirely), resulting in only ~4-5 dry_veggies ever appearing across a 7-day plan.

Additionally, `generateWeeklyPlan` does not pass the lunch gravy as an overlap reference when composing dinner, so semantically similar gravies (e.g., Masoor Dal lunch + Dal Tadka dinner — both lentil-based) can appear on the same day.

The fix leverages the existing `category` field on each `Ingredient` to distinguish signature ingredients (categories: `"protein"`, `"lentils"`, `"vegetables"`) from pantry staples (categories: `"spices"`, `"dairy"`, `"oils"`, `"grains"`, `"nuts"`, `"condiments"`, `"fruits"`). The `applyIngredientOverlap` path in `mealSelector.ts` is unaffected — it already uses a curated `keyIngredients` list from the rules file.

## Glossary

- **Bug_Condition (C)**: Two components share only pantry-staple ingredients (spices, oils, dairy, grains) but `hasIngredientOverlap` reports them as overlapping; OR lunch and dinner gravies are semantically similar (share a signature ingredient like a lentil) but no cross-meal overlap check is performed
- **Property (P)**: `hasIngredientOverlap` only detects overlap on signature ingredients; dinner gravy selection considers lunch gravy as an overlap reference
- **Preservation**: Existing protein conflict detection, same-day dedup, sliding window, `applyIngredientOverlap` (rule-based path), and progressive relaxation must remain unchanged
- **`hasIngredientOverlap`**: Function in `planGenerator.ts` that checks if two components share ingredients — currently compares ALL ingredient names
- **`getComponentIngredientNames`**: Helper that extracts all ingredient names as a lowercase set — needs to be replaced with a signature-only variant
- **`pickComponent`**: Function in `planGenerator.ts` that selects a component with progressive constraint relaxation (5 passes)
- **`composeMeal`**: Function in `planGenerator.ts` that assembles a ComposedMeal (base, gravy, dry_veggie, side)
- **`generateWeeklyPlan`**: Function that builds the 7-day plan — currently does not pass lunch gravy as overlap ref for dinner
- **Signature ingredient**: An ingredient whose `category` is `"protein"`, `"lentils"`, or `"vegetables"` — these define a dish's identity
- **Pantry staple**: An ingredient whose `category` is `"spices"`, `"dairy"`, `"oils"`, `"grains"`, `"nuts"`, `"condiments"`, or `"fruits"` — common across many dishes

## Bug Details

### Bug Condition

The bug has two parts:

**Part A — False-positive overlap in `hasIngredientOverlap`:**
The function compares ALL ingredient names between two components. Since nearly every Indian dish uses Onion (vegetables), Cumin Seeds (spices), Turmeric Powder (spices), Oil (oils), etc., most component pairs are flagged as overlapping. This causes Pass 1 of `pickComponent` to reject almost all dry_veggie candidates when the overlap reference is a gravy.

**Part B — Missing cross-meal overlap reference:**
`generateWeeklyPlan` passes lunch component IDs as same-day dedup IDs for dinner, but does NOT pass the lunch gravy component as an ingredient-overlap reference when picking the dinner gravy. Two dal gravies (e.g., Masoor Dal + Dal Tadka) have different IDs so they pass dedup, and no ingredient overlap check catches their shared lentil base.

**Formal Specification:**
```
FUNCTION isBugCondition_PartA(componentA, componentB)
  INPUT: componentA of type MealComponent, componentB of type MealComponent
  OUTPUT: boolean

  // Bug triggers when overlap is detected but ONLY on pantry staples
  sharedNames := intersection(
    ingredientNames(componentA),
    ingredientNames(componentB)
  )
  signatureCategories := {"protein", "lentils", "vegetables"}
  
  sharedSignature := FILTER sharedNames WHERE
    ingredient.category IN signatureCategories
  
  RETURN sharedNames.size > 0
         AND sharedSignature.size == 0
         // i.e., overlap is entirely pantry staples — false positive
END FUNCTION

FUNCTION isBugCondition_PartB(lunchGravy, dinnerGravy)
  INPUT: lunchGravy of type MealComponent, dinnerGravy of type MealComponent
  OUTPUT: boolean

  // Bug triggers when lunch and dinner gravies share a signature ingredient
  // but no overlap check is performed between them
  lunchSig := signatureIngredientNames(lunchGravy)
  dinnerSig := signatureIngredientNames(dinnerGravy)
  
  RETURN intersection(lunchSig, dinnerSig).size > 0
         AND lunchGravy.id != dinnerGravy.id
         // They share a signature ingredient but pass same-day dedup
END FUNCTION
```

### Examples

- **False positive (Part A)**: Dal Tadka (gravy) has Onion, Tomato, Ghee, Cumin Seeds. Beans Poriyal (dry_veggie) has Coconut, Mustard Seeds. Current `hasIngredientOverlap` returns false (no shared names). But Aloo Gobi (dry_veggie) with Onion, Turmeric Powder would return true — a false positive since the overlap is only on pantry staples, not on the signature ingredient (Cauliflower/Potato).
- **False positive (Part A)**: Chicken Chettinad Curry (gravy) has Chicken, Onion, Black Pepper, Fennel Seeds. Kovakkai Poriyal (dry_veggie) has Ivy Gourd, Onion, Mustard Seeds, Turmeric Powder. Current function returns true (shared "Onion") — false positive since the signature ingredients (Chicken vs Ivy Gourd) are different.
- **True positive preserved**: Sambar (gravy) has Drumstick. Drumstick Poriyal (dry_veggie) has Drumstick. Both current and fixed function should detect this overlap on the signature vegetable.
- **Missing cross-meal check (Part B)**: Masoor Dal (lunch gravy, signature: "Masoor Dal (Red Lentils)" category lentils) + Dal Tadka (dinner gravy, signature: "Toor Dal" category lentils). These are different lentils so they would NOT overlap on exact name match. However, Masoor Dal (lunch) + Moong Dal (dinner) also wouldn't overlap. The real same-day issue is when the SAME lentil appears in both (e.g., two dishes both using Toor Dal).
- **Edge case (Part B)**: Rajma (lunch, signature: "Rajma (Kidney Beans)" lentils) + Fish Curry (dinner, signature: "Fish" protein). No shared signature ingredients — should be allowed.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `hasProteinConflict` continues to detect cross-group protein conflicts (e.g., chicken + fish)
- `applyIngredientOverlap` in `mealSelector.ts` continues to use the curated `keyIngredients` list from rules — no changes
- Progressive relaxation in `pickComponent` (Passes 2–5) continues to fall back gracefully
- Same-day dedup continues to prevent the same component ID from appearing in both lunch and dinner
- Sliding window continues to prevent the same component from repeating within a 3-day window
- Lunch and dinner gravies from completely different families (e.g., Rajma + Fish Curry) continue to be allowed

**Scope:**
All inputs where components share only pantry-staple ingredients should no longer be flagged as overlapping. All inputs where components share a signature ingredient (protein, lentil, or vegetable) should continue to be flagged. The cross-meal gravy overlap check is additive — it only adds a new constraint for dinner gravy selection.

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Overly broad ingredient comparison in `hasIngredientOverlap`**: The function calls `getComponentIngredientNames` which extracts ALL ingredient names as a flat set, then checks for any intersection. It does not distinguish between signature ingredients (protein, lentils, vegetables) and pantry staples (spices, oils, dairy, grains). Since Indian dishes share many pantry staples, nearly every pair triggers a false positive.

2. **`getComponentIngredientNames` discards category information**: The helper returns `Set<string>` of just names, losing the `category` field that could distinguish signature from pantry ingredients. The `Ingredient` type already has a `category: string` field with values like `"protein"`, `"lentils"`, `"vegetables"`, `"spices"`, `"dairy"`, `"oils"`, etc.

3. **Missing overlap reference in dinner gravy selection**: In `generateWeeklyPlan`, the dinner `ComposeMealConstraints` includes lunch component IDs in `sameDayIds` for dedup, but `composeMeal` only uses `overlapRef` within a single meal (base→gravy, gravy→dry_veggie). There is no mechanism to pass the lunch gravy as an overlap reference when picking the dinner gravy.

4. **`composeMeal` inline path lacks cross-meal overlap parameter**: The `composeMeal` function signature and the `pickComponent` calls for gravy selection do not accept an external overlap reference for cross-meal comparison. The gravy `pickComponent` call only uses `base` as `overlapRef`.

## Correctness Properties

Property 1: Bug Condition — Signature-Only Overlap Detection

_For any_ pair of MealComponents (A, B) where A and B share at least one ingredient name but ALL shared ingredients have categories in the pantry-staple set (`"spices"`, `"dairy"`, `"oils"`, `"grains"`, `"nuts"`, `"condiments"`, `"fruits"`), the fixed `hasIngredientOverlap` function SHALL return false (no overlap detected).

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — True Overlap Still Detected

_For any_ pair of MealComponents (A, B) where A and B share at least one ingredient whose `category` is in the signature set (`"protein"`, `"lentils"`, `"vegetables"`), the fixed `hasIngredientOverlap` function SHALL return true (overlap detected), preserving the existing behavior for genuine ingredient conflicts.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — Cross-Meal Gravy Overlap

_For any_ day where the lunch gravy and a dinner gravy candidate share a signature ingredient (same ingredient name with category `"protein"`, `"lentils"`, or `"vegetables"`), the fixed `generateWeeklyPlan` / `composeMeal` SHALL avoid selecting that candidate for dinner gravy (subject to progressive relaxation).

**Validates: Requirements 2.4, 2.5**

Property 4: Preservation — Non-Overlapping Cross-Meal Gravies Allowed

_For any_ day where the lunch gravy and dinner gravy share NO signature ingredients, the fixed code SHALL continue to allow this pairing without interference, preserving existing variety.

**Validates: Requirements 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/core/planGenerator.ts`

**Function**: `getComponentIngredientNames`

**Specific Changes**:
1. **Replace `getComponentIngredientNames` with `getSignatureIngredientNames`**: Instead of returning all ingredient names, filter to only include ingredients whose `category` is in the signature set: `"protein"`, `"lentils"`, `"vegetables"`. This leverages the existing `category` field on the `Ingredient` type.

**Function**: `hasIngredientOverlap`

2. **Update `hasIngredientOverlap` to use signature-only comparison**: Replace the call to `getComponentIngredientNames` with `getSignatureIngredientNames`. The protein conflict check (`hasProteinConflict`) remains unchanged as a separate concern.

**Function**: `composeMeal`

3. **Add optional `lunchGravyRef` parameter to `composeMeal`**: Accept an optional `MealComponent | null` parameter representing the lunch gravy, used as an additional overlap reference when picking the dinner gravy.

4. **Pass `lunchGravyRef` as overlap reference in gravy `pickComponent` call**: When `lunchGravyRef` is provided, use it as the `overlapRef` for the gravy pick (in addition to or instead of `base`, since base→gravy overlap is less critical than cross-meal gravy overlap). The simplest approach: check overlap against BOTH base and lunchGravyRef — if either overlaps, skip the candidate.

**Function**: `generateWeeklyPlan`

5. **Extract lunch gravy and pass to dinner `composeMeal`**: After composing lunch, extract the lunch gravy component and pass it as `lunchGravyRef` to the dinner `composeMeal` call.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that construct component pairs with only pantry-staple overlap and verify that `hasIngredientOverlap` incorrectly returns true. Also generate weekly plans and check for same-day dal pairings.

**Test Cases**:
1. **Pantry-Only Overlap Test**: Construct a gravy with Onion+Cumin Seeds and a dry_veggie with Onion+Mustard Seeds — `hasIngredientOverlap` returns true on unfixed code (will fail assertion that it should be false)
2. **Dry Veggie Elimination Test**: Run `pickComponent` with a gravy ref containing common pantry staples and verify that most dry_veggie candidates are eliminated in Pass 1 (will demonstrate the variety reduction)
3. **Cross-Meal Dal Pairing Test**: Generate multiple weekly plans and check if any day has two lentil-based gravies (will demonstrate Part B on unfixed code)
4. **Signature Overlap Still Works**: Construct two components sharing Drumstick (vegetables category) — should still detect overlap (sanity check)

**Expected Counterexamples**:
- `hasIngredientOverlap` returns true for pairs sharing only Onion, Cumin Seeds, or other pantry staples
- Possible causes: `getComponentIngredientNames` returns all names without category filtering

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL (componentA, componentB) WHERE isBugCondition_PartA(componentA, componentB) DO
  result := hasIngredientOverlap_fixed(componentA, componentB)
  ASSERT result == false  // No false positive on pantry-only overlap
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL (componentA, componentB) WHERE NOT isBugCondition_PartA(componentA, componentB) DO
  // Components share a signature ingredient — overlap should still be detected
  ASSERT hasIngredientOverlap_original(componentA, componentB) == hasIngredientOverlap_fixed(componentA, componentB)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many component pairs automatically across the ingredient domain
- It catches edge cases where category boundaries might be misclassified
- It provides strong guarantees that true overlaps are still detected

**Test Plan**: Observe behavior on UNFIXED code first for component pairs with signature ingredient overlap, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Signature Overlap Preservation**: Verify that pairs sharing a vegetable (e.g., Drumstick, Cauliflower) still trigger overlap after the fix
2. **Protein Conflict Preservation**: Verify that `hasProteinConflict` continues to work independently of the ingredient overlap change
3. **Progressive Relaxation Preservation**: Verify that `pickComponent` still falls back through passes 2–5 when no candidates pass signature-only overlap
4. **MealSelector Path Preservation**: Verify that `applyIngredientOverlap` in `mealSelector.ts` is completely unaffected

### Unit Tests

- Test `getSignatureIngredientNames` returns only protein/lentils/vegetables category ingredients
- Test `hasIngredientOverlap` returns false for pantry-only shared ingredients
- Test `hasIngredientOverlap` returns true for shared signature ingredients
- Test `composeMeal` with `lunchGravyRef` avoids same-lentil dinner gravy
- Test edge case: components with no ingredients, components with only pantry ingredients

### Property-Based Tests

- Generate random component pairs with controlled ingredient categories and verify overlap detection matches signature-only semantics
- Generate random weekly plan inputs and verify no same-day lentil-gravy pairings (with cross-meal overlap enabled)
- Generate random component pairs and verify `hasProteinConflict` results are unchanged

### Integration Tests

- Generate full 7-day plans with north_indian health preferences and verify dry_veggie variety is significantly improved (more than 5 unique dry_veggies across the week)
- Generate full 7-day plans and verify no day has two gravies sharing a signature ingredient
- Verify that the MealSelector-based path (`applyIngredientOverlap`) produces identical results before and after the fix
