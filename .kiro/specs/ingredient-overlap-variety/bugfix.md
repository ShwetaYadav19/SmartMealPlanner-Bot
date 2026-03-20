# Bugfix Requirements Document

## Introduction

The `hasIngredientOverlap` function in `planGenerator.ts` compares ALL ingredient names between two meal components to determine overlap. This causes common pantry staples (Onion, Turmeric Powder, Oil, Cumin Seeds, Tomato, Ghee, Ginger-Garlic Paste, Mustard Seeds, Curry Leaves, Green Chilli, etc.) to trigger false-positive overlaps. As a result, most veg `dry_veggie` components are eliminated when paired with protein gravies, reducing variety to ~4-5 surviving options out of 24 north_indian dry_veggies. Users see the same dry_veggies repeatedly across a 7-day plan.

Additionally, the same-day dedup constraint only prevents the exact same component ID from appearing in both lunch and dinner. It does not prevent semantically similar dishes (e.g., Masoor Dal at lunch + Dal Tadka at dinner — both are dal/lentil gravies) from being paired on the same day. The ingredient overlap check between lunch gravy and dinner gravy should catch this, but because it currently compares all ingredients (including pantry staples), it either over-filters (eliminating too many candidates) or under-filters (missing the semantic similarity when the overlap is relaxed in Pass 2).

Note: `applyIngredientOverlap` in `mealSelector.ts` already uses a curated `keyIngredients` list from the rules file and is not affected by the pantry-staple overlap bug. The bug is isolated to the inline `hasIngredientOverlap` path used by `pickComponent` / `composeMeal` in `planGenerator.ts`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `hasIngredientOverlap` in `planGenerator.ts` compares two components (e.g., a gravy and a dry_veggie candidate) THEN the system treats ANY shared ingredient name as an overlap, including common pantry staples like Onion, Turmeric Powder, Oil, Cumin Seeds, Tomato, Ghee, Ginger-Garlic Paste, Mustard Seeds, Curry Leaves, and Green Chilli

1.2 WHEN `pickComponent` selects a dry_veggie candidate and the overlap reference is a gravy that contains common pantry staples THEN the system eliminates most dry_veggie candidates in Pass 1 because nearly all dry_veggies share at least one pantry staple with the gravy

1.3 WHEN the overlap constraint eliminates most dry_veggie candidates in Pass 1 of `pickComponent` THEN the system falls through to Pass 2 (which relaxes ingredient overlap entirely), causing the sliding-window and same-day-dedup constraints to dominate selection and resulting in only ~4-5 dry_veggies ever being chosen across a 7-day plan

1.4 WHEN `generateWeeklyPlan` builds dinner constraints, it passes the lunch gravy's component ID as a same-day dedup ID for the dinner gravy slot, BUT it does not pass the lunch gravy as an ingredient-overlap reference for dinner gravy selection THEN semantically similar gravies (e.g., Masoor Dal at lunch + Dal Tadka at dinner) can be paired on the same day because they have different component IDs and no cross-meal ingredient overlap check is performed

1.5 WHEN two dal/lentil gravies appear on the same day (e.g., Wednesday: Masoor Dal lunch + Dal Tadka dinner) THEN the user perceives repetition because both dishes are lentil-based, even though they are technically different components

### Expected Behavior (Correct)

2.1 WHEN `hasIngredientOverlap` compares two components THEN the system SHALL only consider "signature" or "hero" ingredients that define a dish's identity (e.g., Fish, Chicken, Paneer, Spinach, Okra, Cauliflower, Potato) and SHALL ignore common pantry staples (Onion, Oil, Turmeric Powder, Cumin Seeds, Tomato, Ghee, Ginger-Garlic Paste, Mustard Seeds, Curry Leaves, Green Chilli, Salt, etc.)

2.2 WHEN `pickComponent` selects a dry_veggie candidate and the overlap reference is a gravy THEN the system SHALL only eliminate candidates that share a signature ingredient with the gravy (e.g., both contain Cauliflower, or both contain Paneer), preserving candidates that only share pantry staples

2.3 WHEN the ingredient overlap check uses signature-only comparison THEN the system SHALL allow significantly more dry_veggie candidates to pass the overlap check in Pass 1 of `pickComponent`, resulting in greater variety of dry_veggies across a 7-day plan

2.4 WHEN `generateWeeklyPlan` composes dinner and the lunch gravy has already been selected THEN the system SHALL pass the lunch gravy as an ingredient-overlap reference when picking the dinner gravy, so that semantically similar gravies (e.g., two dal/lentil dishes sharing "Toor Dal" or "Masoor Dal" as signature ingredients) are avoided on the same day

2.5 WHEN the lunch gravy and a dinner gravy candidate share a signature ingredient (e.g., both contain a lentil like Toor Dal, Masoor Dal, or Moong Dal) THEN the system SHALL treat this as ingredient overlap and prefer a different gravy for dinner

### Unchanged Behavior (Regression Prevention)

3.1 WHEN two components share a signature/hero ingredient (e.g., both contain Cauliflower, or both contain Paneer) THEN the system SHALL CONTINUE TO detect ingredient overlap and avoid pairing them in the same meal

3.2 WHEN two components have conflicting protein groups (e.g., Chicken gravy + Fish dry_veggie) THEN the system SHALL CONTINUE TO detect the protein conflict via `hasProteinConflict` and avoid pairing them

3.3 WHEN `applyIngredientOverlap` in `mealSelector.ts` is used (the rule-based path) THEN the system SHALL CONTINUE TO use the `keyIngredients` list from the rules file without any change in behavior

3.4 WHEN `pickComponent` applies progressive relaxation (Passes 2–5) THEN the system SHALL CONTINUE TO fall back gracefully when no candidates pass the stricter constraints

3.5 WHEN the same-day dedup constraint is applied THEN the system SHALL CONTINUE TO prevent the same gravy or dry_veggie from appearing in both lunch and dinner on the same day

3.6 WHEN lunch and dinner gravies are from completely different families (e.g., Rajma at lunch + Fish Curry at dinner) and share no signature ingredients THEN the system SHALL CONTINUE TO allow this pairing without interference from the cross-meal overlap check
