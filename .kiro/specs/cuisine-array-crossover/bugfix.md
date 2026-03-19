# Bugfix Requirements Document

## Introduction

The South Indian crossover filter in `mealSelector.ts` relies on a hardcoded `DEFAULT_SI_WHITELIST` array and a duplicate `whitelist` field in `meal-selection-rules.json` to decide which south_indian items are allowed when the user selects `cuisine: "both"`. This is fragile: every time a dish is added or removed, both the JSON rules file and the code constant must be updated in sync. Items get missed, and the whitelist drifts from the actual data.

The fix replaces the whitelist-based approach with a data-driven model. The `cuisine` field on `Meal` and `MealComponent` changes from a single string (`"north_indian" | "south_indian"`) to an array (`("north_indian" | "south_indian")[]`). Items that work across both cuisines are tagged `["south_indian", "north_indian"]`. The crossover filter is eliminated entirely — the cuisine filter simply checks whether the user's preferred cuisine is present in the item's cuisine array.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a new South Indian dish is added to `meals.json` or `meal-components.json` but not added to both the `DEFAULT_SI_WHITELIST` constant in `mealSelector.ts` and the `whitelist` array in `meal-selection-rules.json` THEN the system silently excludes that dish for `cuisine: "both"` users even though it should be a crossover item

1.2 WHEN a dish is removed or renamed in the data files but the whitelist entries are not updated THEN the system retains stale whitelist entries that never match, giving the false impression the dish is still available

1.3 WHEN `cuisine` preference is `"both"` THEN the system runs two separate filter passes (cuisine-filter then south-indian-crossover) using name-based string matching against a hardcoded whitelist, which is error-prone and couples filter logic to specific dish names

1.4 WHEN the `whitelist` array in `meal-selection-rules.json` diverges from `DEFAULT_SI_WHITELIST` in `mealSelector.ts` THEN the system may produce inconsistent filtering results depending on which whitelist takes precedence

### Expected Behavior (Correct)

2.1 WHEN a new South Indian dish is added to `meals.json` or `meal-components.json` with `cuisine: ["south_indian", "north_indian"]` THEN the system SHALL automatically include that dish for `cuisine: "both"` users without any whitelist update

2.2 WHEN a dish is removed or renamed in the data files THEN the system SHALL require no separate whitelist maintenance — the cuisine array on the item itself is the single source of truth

2.3 WHEN `cuisine` preference is `"both"` THEN the system SHALL include all items regardless of their cuisine array (pass all through), and WHEN `cuisine` preference is a single value THEN the system SHALL include only items whose cuisine array contains that value

2.4 WHEN the `south-indian-crossover` rule, `DEFAULT_SI_WHITELIST` constant, and `matchesWhitelist()` function are removed THEN the system SHALL produce identical filtering results for all cuisine preferences using only the cuisine-filter rule and the item's cuisine array

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `cuisine` preference is `"north_indian"` THEN the system SHALL CONTINUE TO return only items tagged with `"north_indian"` in their cuisine array

3.2 WHEN `cuisine` preference is `"south_indian"` THEN the system SHALL CONTINUE TO return only items tagged with `"south_indian"` in their cuisine array

3.3 WHEN `cuisine` preference is `"both"` THEN the system SHALL CONTINUE TO return the same set of crossover South Indian items that were previously on the whitelist (now tagged `["south_indian", "north_indian"]`) plus all North Indian items

3.4 WHEN diet, style, excluded-dishes, sliding-window, same-day-dedup, ingredient-overlap, or cuisine-alternation rules are evaluated THEN the system SHALL CONTINUE TO apply those rules identically — only the cuisine filter logic changes

3.5 WHEN the `MealFilter.cuisine` or `MealComponentFilter.cuisine` filter is set to a single cuisine value in repository adapter calls THEN the system SHALL CONTINUE TO return only items whose cuisine array contains that value
