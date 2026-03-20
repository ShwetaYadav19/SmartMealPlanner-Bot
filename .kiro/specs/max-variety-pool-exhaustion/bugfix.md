# Bugfix Requirements Document

## Introduction

The meal plan generator does not maximize variety across a 7-day plan. Components (gravies, dry_veggies, bases, sides) can repeat well before the available pool is exhausted. The root cause is the sliding-window approach used in both `planGenerator.ts` (`pickComponent` with a 3-day `recentIds` window) and `dishPreview.ts` (`buildPlanFromComponents` with a 2-day window). These small windows only prevent immediate back-to-back repeats — once a component falls outside the window, it becomes eligible again even when many other components in the same category have never been used. With a random shuffle on each call, there is no guarantee of cycling through all options before repeating.

For example, with 12 gravies available for a user's preferences, the same gravy can appear on day 1 and day 5 while 6 other gravies were never picked. The user's actual plan showed Palak Sabzi ×3, Lauki Sabzi ×3, Gobhi Matar ×3, Dal Tadka ×2, Masoor Dal ×2, Rajma ×2 — with many components never used.

The fix should ensure each component category exhausts its full available pool before any component repeats, independently per slot (lunch/dinner). Only when every component in a category-slot pool has been used should repeats begin (cycling back through the pool). This applies to all three code paths: the inline `pickComponent` path, the `buildPlanFromComponents` dish preview path, and the rule-based `MealSelector.applyConstraints` path.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a 7-day plan is generated and the component pool for a category (e.g. gravy) in a slot (e.g. lunch) has more items than the sliding window size (3 for planGenerator, 2 for dishPreview) THEN the system allows components to repeat after falling out of the window, even when unused components remain in the pool

1.2 WHEN `pickComponent` is called with `recentIds` built from a 3-day sliding window THEN components used on day 1 become eligible again on day 5, regardless of whether all other components in the pool have been used

1.3 WHEN `buildPlanFromComponents` in `dishPreview.ts` composes meals using a 2-day sliding window THEN components used on day 1 become eligible again on day 4, regardless of whether all other components in the pool have been used

1.4 WHEN `MealSelector.applySlidingWindow` is called with a window-size-based history THEN components outside the window are treated as fully available, ignoring whether the full pool has been cycled through

1.5 WHEN the plan is generated with sufficient pool sizes (e.g. 12 gravies) THEN some components appear 2–3 times while other components in the same category are never used

### Expected Behavior (Correct)

2.1 WHEN a 7-day plan is generated and the component pool for a category in a slot has N items THEN the system SHALL use all N items before repeating any component (repeats only begin after the full pool is exhausted)

2.2 WHEN `pickComponent` selects a component for a category-slot combination THEN the system SHALL track all previously used IDs for that category-slot across the entire plan (not just a sliding window) and SHALL prefer unused components over used ones

2.3 WHEN `buildPlanFromComponents` composes meals for the 7-day plan THEN the system SHALL track all previously used IDs per category-slot across all days and SHALL prefer unused components over used ones

2.4 WHEN `MealSelector.applySlidingWindow` (or its replacement) orders the candidate pool THEN the system SHALL deprioritize all previously used components for that category-slot, not just those within a fixed window

2.5 WHEN the pool size for a category-slot is >= 7 THEN the system SHALL produce 7 unique components across the 7-day plan (no repeats at all for that category-slot)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN same-day dedup constraints are active (base, gravy, dry_veggie must differ between lunch and dinner on the same day) THEN the system SHALL CONTINUE TO enforce same-day uniqueness

3.2 WHEN ingredient overlap avoidance is active (gravy and dry_veggie should not share signature ingredients within a meal) THEN the system SHALL CONTINUE TO avoid ingredient overlap within a meal

3.3 WHEN protein conflict prevention is active (e.g. chicken gravy + fish dry_veggie) THEN the system SHALL CONTINUE TO prevent cross-group protein conflicts within a meal

3.4 WHEN cuisine coherence filtering is active (pure NI base should pair with pure NI components) THEN the system SHALL CONTINUE TO enforce cuisine coherence

3.5 WHEN the pool size for a category-slot is smaller than 7 THEN the system SHALL CONTINUE TO compose valid meals, allowing repeats only after the pool is fully exhausted

3.6 WHEN progressive relaxation is needed (all preferred candidates are exhausted) THEN the system SHALL CONTINUE TO relax constraints gracefully rather than failing

3.7 WHEN cross-meal overlap avoidance is active (dinner gravy should differ from lunch gravy's signature ingredients) THEN the system SHALL CONTINUE TO avoid cross-meal ingredient overlap
