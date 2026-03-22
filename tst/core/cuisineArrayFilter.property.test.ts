// Property tests for cuisine array filtering — Properties 1 & 2 (bugfix spec)
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MealSelector } from '../../src/core/mealSelector';
import type {
  MealComponent,
  Meal,
  Rule,
  RuleEvaluationContext,
  ComponentCategory,
} from '../../src/core/types';

// --- Mock repositories (filterPool doesn't call them) ---

const mockRulesRepo = { getRules: async () => [] as Rule[] };
const mockMealRepo = { getMeals: async () => [] as Meal[], getMealById: async () => null };
const mockComponentRepo = { getComponents: async () => [] as MealComponent[] };

function makeSelector(): MealSelector {
  return new MealSelector(mockRulesRepo as any, mockMealRepo as any, mockComponentRepo as any);
}

// --- Custom Arbitraries ---

const arbComponentCategory: fc.Arbitrary<ComponentCategory> = fc.constantFrom(
  'base', 'gravy', 'dry_veggie', 'side',
);

const arbIngredient = fc.record({
  name: fc.constantFrom('chicken', 'egg', 'paneer', 'spinach', 'cauliflower', 'rice', 'dal', 'tomato'),
  quantity: fc.constant('100g'),
  category: fc.constant('protein'),
});

function arbMealComponent(): fc.Arbitrary<MealComponent> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    category: arbComponentCategory,
    cuisine: fc.subarray(['north_indian' as const, 'south_indian' as const], { minLength: 1 }),
    diet: fc.constantFrom('veg' as const, 'non_veg' as const),
    style: fc.constantFrom('health' as const, 'regular' as const),
    slots: fc.constantFrom(
      ['lunch'] as ('lunch' | 'dinner')[],
      ['dinner'] as ('lunch' | 'dinner')[],
      ['lunch', 'dinner'] as ('lunch' | 'dinner')[],
    ),
    ingredients: fc.array(arbIngredient, { minLength: 0, maxLength: 3 }),
  });
}

function arbMealComponentWithIngredients(): fc.Arbitrary<MealComponent> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    category: arbComponentCategory,
    cuisine: fc.subarray(['north_indian' as const, 'south_indian' as const], { minLength: 1 }),
    diet: fc.constantFrom('veg' as const, 'non_veg' as const),
    style: fc.constantFrom('health' as const, 'regular' as const),
    slots: fc.constantFrom(
      ['lunch'] as ('lunch' | 'dinner')[],
      ['dinner'] as ('lunch' | 'dinner')[],
      ['lunch', 'dinner'] as ('lunch' | 'dinner')[],
    ),
    ingredients: fc.array(arbIngredient, { minLength: 1, maxLength: 4 }),
  });
}

function makeContext(
  prefs: RuleEvaluationContext['userPreferences'],
  excludedDishIds: string[] = [],
): RuleEvaluationContext {
  return {
    userPreferences: prefs,
    excludedDishIds,
    slot: 'lunch',
    dayIndex: 0,
    history: {},
    sameDaySelections: {},
  };
}

// --- Rule factories ---

const cuisineFilterRule: Rule = {
  id: 'cuisine-filter',
  name: 'Cuisine Preference Filter',
  description: 'Filter by cuisine preference',
  scope: 'all_slots',
  action: 'filter',
  conditions: { preferenceField: 'cuisine' },
};

const dietFilterRule: Rule = {
  id: 'diet-filter',
  name: 'Diet Preference Filter',
  description: 'Filter by diet preference',
  scope: 'all_slots',
  action: 'filter',
  conditions: { preferenceField: 'diet' },
};

const styleFilterRule: Rule = {
  id: 'style-filter',
  name: 'Style Preference Filter',
  description: 'Filter by style preference',
  scope: 'all_slots',
  action: 'filter',
  conditions: { preferenceField: 'style' },
};

const excludedDishesRule: Rule = {
  id: 'excluded-dishes',
  name: 'Excluded Dishes Filter',
  description: 'Remove excluded dishes',
  scope: 'all_slots',
  action: 'filter',
  conditions: {},
};

const slidingWindowRule: Rule = {
  id: 'sliding-window',
  name: 'Sliding Window',
  description: 'Variety window',
  scope: 'all_slots',
  action: 'limit',
  conditions: { windowSize: 3 },
};

const sameDayDedupRule: Rule = {
  id: 'same-day-dedup',
  name: 'Same Day Dedup',
  description: 'Avoid same-day repeats',
  scope: 'all_slots',
  action: 'constrain',
  conditions: { constraintType: 'same_day_dedup' },
};

const ingredientOverlapRule: Rule = {
  id: 'ingredient-overlap',
  name: 'Ingredient Overlap',
  description: 'Avoid overlap',
  scope: 'lunch_component',
  action: 'constrain',
  conditions: {
    constraintType: 'ingredient_overlap',
    autoKeyCategories: ['protein'],
  },
};

// --- Property Tests ---

// Property 1: Bug Condition - Cuisine Array Inclusion
// **Validates: Requirements 2.1, 2.2, 2.3**
describe('Property 1: Cuisine Array Inclusion — applyCuisineFilter includes item iff cuisine array contains preference', () => {
  it('for any item with a cuisine array and any single-cuisine preference, applyCuisineFilter includes the item iff the array contains the preference value', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 20 }),
        fc.constantFrom('north_indian' as const, 'south_indian' as const),
        (pool, cuisinePref) => {
          const prefs = { cuisine: cuisinePref, diet: 'veg' as const, style: 'health' as const };
          const ctx = makeContext(prefs);
          const result = selector.filterPool(pool, [cuisineFilterRule], ctx);
          const resultIds = new Set(result.map((item) => item.id));

          for (const item of pool) {
            const shouldBeIncluded = item.cuisine.includes(cuisinePref);
            expect(resultIds.has(item.id)).toBe(shouldBeIncluded);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('when preference is "both", only items with north_indian in their cuisine array pass through', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 0, maxLength: 20 }),
        (pool) => {
          const prefs = { cuisine: 'both' as const, diet: 'veg' as const, style: 'health' as const };
          const ctx = makeContext(prefs);
          const result = selector.filterPool(pool, [cuisineFilterRule], ctx);

          const expected = pool.filter((item) => item.cuisine.includes('north_indian'));
          expect(result.length).toBe(expected.length);
          const resultIds = new Set(result.map((item) => item.id));
          for (const item of expected) {
            expect(resultIds.has(item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// Property 2: Preservation - Non-Cuisine Filter Behavior
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
describe('Property 2: Non-cuisine filter rules produce identical results regardless of cuisine array shape', () => {
  it('diet-filter produces the same result for any pool — cuisine field is irrelevant', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 20 }),
        fc.constantFrom('veg' as const, 'non_veg' as const, 'veg_with_eggs' as const),
        (pool, dietPref) => {
          const prefs = { cuisine: 'both' as const, diet: dietPref, style: 'health' as const };
          const ctx = makeContext(prefs);
          const result = selector.filterPool(pool, [dietFilterRule], ctx);

          if (dietPref === 'veg_with_eggs') {
            // veg_with_eggs includes veg items + egg-only non_veg items
            for (const item of result) {
              expect(item.diet === 'veg' || item.diet === 'non_veg').toBe(true);
            }
            // All veg items should be included
            const vegItems = pool.filter((item) => item.diet === 'veg');
            const resultVeg = result.filter((item) => item.diet === 'veg');
            expect(resultVeg.length).toBe(vegItems.length);
          } else {
            // Diet filter should only look at diet field, not cuisine
            for (const item of result) {
              expect(item.diet).toBe(dietPref);
            }
            // Every matching item should be included
            const expected = pool.filter((item) => item.diet === dietPref);
            expect(result.length).toBe(expected.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('style-filter produces the same result for any pool — cuisine field is irrelevant', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 20 }),
        fc.constantFrom('health' as const, 'regular' as const),
        (pool, stylePref) => {
          const prefs = { cuisine: 'both' as const, diet: 'veg' as const, style: stylePref };
          const ctx = makeContext(prefs);
          const result = selector.filterPool(pool, [styleFilterRule], ctx);

          for (const item of result) {
            expect(item.style).toBe(stylePref);
          }
          const expected = pool.filter((item) => item.style === stylePref);
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('excluded-dishes filter produces the same result for any pool — cuisine field is irrelevant', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 20 }),
        (pool) => {
          // Exclude a subset of IDs
          const excludeCount = Math.max(1, Math.floor(pool.length / 3));
          const excludedIds = pool.slice(0, excludeCount).map((i) => i.id);
          const excludedSet = new Set(excludedIds);

          const prefs = { cuisine: 'both' as const, diet: 'veg' as const, style: 'health' as const };
          const ctx = makeContext(prefs, excludedIds);
          const result = selector.filterPool(pool, [excludedDishesRule], ctx);

          // No excluded item in result
          for (const item of result) {
            expect(excludedSet.has(item.id)).toBe(false);
          }
          // All non-excluded items retained
          const expected = pool.filter((item) => !excludedSet.has(item.id));
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sliding-window produces the same result for any pool — cuisine field is irrelevant', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.uniqueArray(arbMealComponent(), { minLength: 2, maxLength: 15, selector: (c) => c.id }),
        (pool) => {
          const historyIds = pool.slice(0, Math.min(2, pool.length - 1)).map((c) => c.id);
          const windowSet = new Set(historyIds);

          const prefs = { cuisine: 'both' as const, diet: 'veg' as const, style: 'health' as const };
          const ctx = makeContext(prefs);
          ctx.history = { base: historyIds };

          const result = selector.applySlidingWindow(pool, slidingWindowRule, ctx);

          // All items preserved (just reordered)
          expect(result.length).toBe(pool.length);
          const resultIds = new Set(result.map((r) => r.id));
          for (const item of pool) {
            expect(resultIds.has(item.id)).toBe(true);
          }

          // Non-window items come before window items
          const nonWindowCount = pool.filter((c) => !windowSet.has(c.id)).length;
          const resultNonWindow = result.slice(0, nonWindowCount);
          for (const item of resultNonWindow) {
            expect(windowSet.has(item.id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('same-day-dedup produces the same result for any pool — cuisine field is irrelevant', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 2, maxLength: 15 }),
        (pool) => {
          const sameDayCount = Math.max(1, Math.floor(pool.length / 3));
          const sameDayIds = pool.slice(0, sameDayCount).map((c) => c.id);
          const sameDaySet = new Set(sameDayIds);
          const nonSameDayCount = pool.filter((c) => !sameDaySet.has(c.id)).length;

          const prefs = { cuisine: 'both' as const, diet: 'veg' as const, style: 'health' as const };
          const ctx = makeContext(prefs);
          ctx.sameDaySelections = { gravy: sameDayIds };

          const result = selector.applySameDayDedup(pool, ctx);

          if (nonSameDayCount > 0) {
            // Strict: no same-day items
            for (const item of result) {
              expect(sameDaySet.has(item.id)).toBe(false);
            }
          } else {
            // Relaxation: full pool
            expect(result.length).toBe(pool.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ingredient-overlap produces the same result for any pool — cuisine field is irrelevant', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponentWithIngredients(), { minLength: 1, maxLength: 10 }),
        arbMealComponentWithIngredients(),
        (pool, refComponent) => {
          const result = selector.applyIngredientOverlap(pool, ingredientOverlapRule, refComponent);

          // Result is never empty for non-empty pool (progressive relaxation)
          expect(result.length).toBeGreaterThan(0);

          // Result is a subset of pool
          const poolIds = new Set(pool.map((c) => c.id));
          for (const item of result) {
            expect(poolIds.has(item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
