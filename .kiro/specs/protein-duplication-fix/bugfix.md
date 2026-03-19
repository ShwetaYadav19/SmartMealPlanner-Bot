# Bugfix Requirements Document

## Introduction

The weekly meal plan generator allows two protein-heavy dishes to be paired together in the same composed meal (lunch or dinner). For example, "Prawns Curry" (protein gravy) + "Tofu Bhurji" (protein dry_veggie), or "Palak Paneer" (protein gravy) + "Fish Fry" (protein dry_veggie). This results in nutritionally unbalanced meals with excessive protein and no fibre/veggie component.

The root cause is that the `hasProteinConflict` function in both `planGenerator.ts` and `mealSelector.ts` only checks whether two protein dishes belong to *different* protein groups (e.g., chicken vs fish). It does not enforce the fundamental rule: every composed meal should pair one protein component with one fibre/veggie component across its gravy and dry_veggie slots. When both gravy and dry_veggie are protein dishes from the *same* group (or from groups not in the PROTEIN_GROUPS map like tofu/paneer), `hasProteinConflict` returns `false` and the pairing is allowed.

The correct behavior is: in every composed meal, at most one of gravy/dry_veggie should be a protein dish and the other should be a veg/fibre dish. This ensures nutritional balance (protein + fibre) in every meal. For pure-veg users who have no protein dishes in their pool, two veg dishes paired together is acceptable.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a composed meal's gravy is a protein dish (e.g., "Prawns Curry", "Fish Curry", "Tofu Curry", "Palak Paneer", "Chicken Curry") AND the dry_veggie is also a protein dish (e.g., "Tofu Bhurji", "Fish Tikka", "Chicken Pepper Fry", "Prawn Fry", "Paneer Bhurji") THEN the system allows both protein dishes to be paired together, producing a nutritionally unbalanced meal with no fibre/veggie component

1.2 WHEN `hasProteinConflict` is called with two components that are both protein dishes but belong to the same protein group (e.g., "Fish Curry" gravy + "Fish Fry" dry_veggie, both seafood) THEN the system returns `false` (no conflict), allowing two protein dishes to be paired together

1.3 WHEN `hasProteinConflict` is called with a protein component containing tofu or paneer (which are not in the PROTEIN_GROUPS map) THEN the system returns an empty protein group set, causing `hasProteinConflict` to return `false` for all candidates, allowing any protein dish to be paired with it

### Expected Behavior (Correct)

2.1 WHEN a composed meal's gravy is a protein dish (diet: "non_veg", or contains protein ingredients like chicken, fish, tofu, paneer, eggs, prawns) THEN the system SHALL select a veg/fibre dish for the dry_veggie slot, ensuring the meal has one protein component and one fibre/veggie component

2.2 WHEN a composed meal's dry_veggie is a protein dish THEN the system SHALL have selected a veg/fibre dish for the gravy slot, ensuring the meal has one protein component and one fibre/veggie component

2.3 WHEN both available gravy and dry_veggie candidates are protein dishes (no veg/fibre alternative exists in the filtered pool) THEN the system SHALL fall back gracefully and allow the pairing rather than failing to compose a meal

### Unchanged Behavior (Regression Prevention)

3.1 WHEN both the gravy and dry_veggie are veg/fibre dishes (e.g., "Sambar" gravy + "Beans Poriyal" dry_veggie) THEN the system SHALL CONTINUE TO allow this pairing (two veg dishes together is fine, especially for veg-only users)

3.2 WHEN a gravy is a protein dish and the dry_veggie is a veg/fibre dish (e.g., "Fish Curry" gravy + "Carrot Poriyal" dry_veggie) THEN the system SHALL CONTINUE TO allow this pairing (this is the desired balanced meal)

3.3 WHEN a gravy is a veg/fibre dish and the dry_veggie is a protein dish (e.g., "Moong Dal" gravy + "Chicken Fry" dry_veggie) THEN the system SHALL CONTINUE TO allow this pairing (this is the desired balanced meal)

3.4 WHEN ingredient overlap avoidance, sliding window, and same-day dedup constraints are applied THEN the system SHALL CONTINUE TO enforce these constraints alongside the new protein+fibre balance rule

3.5 WHEN the user's diet preference is "veg" and no protein dishes exist in the component pool THEN the system SHALL CONTINUE TO compose meals normally from the all-veg pool without any protein balance constraint interfering
