// Property tests for MealSelector filterPool — Properties 5–9, 15, 16
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

function arbMealComponent(): fc.Arbitrary<MealComponent> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    category: arbComponentCategory,
    cuisine: fc.subarray(['north_indian' as const, 'south_indian' as const], { minLength: 1 }),
    diet: fc.constantFrom('veg' as const, 'non_veg' as const),
    style: fc.constantFrom('health' as const, 'regular' as const),
    slots: fc.constantFrom(['lunch'] as ('lunch' | 'dinner')[], ['dinner'] as ('lunch' | 'dinner')[], ['lunch', 'dinner'] as ('lunch' | 'dinner')[]),
    ingredients: fc.constant([]),
  });
}

function arbMeal(): fc.Arbitrary<Meal> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    cuisine: fc.subarray(['north_indian' as const, 'south_indian' as const], { minLength: 1 }),
    diet: fc.constantFrom('veg' as const, 'non_veg' as const),
    style: fc.constantFrom('health' as const, 'regular' as const),
    slots: fc.constantFrom(
      ['breakfast'] as ('breakfast' | 'lunch' | 'dinner')[],
      ['lunch'] as ('breakfast' | 'lunch' | 'dinner')[],
      ['dinner'] as ('breakfast' | 'lunch' | 'dinner')[],
      ['breakfast', 'lunch'] as ('breakfast' | 'lunch' | 'dinner')[],
    ),
    ingredients: fc.constant([]),
  });
}

function arbUserPreferences(): fc.Arbitrary<RuleEvaluationContext['userPreferences']> {
  return fc.record({
    cuisine: fc.constantFrom('north_indian' as const, 'south_indian' as const, 'both' as const),
    diet: fc.constantFrom('veg' as const, 'non_veg' as const, 'both' as const),
    style: fc.constantFrom('health' as const, 'regular' as const),
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

const dietFallbackRule: Rule = {
  id: 'diet-fallback',
  name: 'Diet Fallback',
  description: 'Non-veg users also see veg items',
  scope: 'all_slots',
  action: 'filter',
  conditions: { preferenceField: 'diet', preferenceValues: ['non_veg'] },
  parameters: { includeFallback: 'veg' },
};

const styleFilterRule: Rule = {
  id: 'style-filter',
  name: 'Style Preference Filter',
  description: 'Filter by style preference',
  scope: 'all_slots',
  action: 'filter',
  conditions: { preferenceField: 'style' },
};

const styleFallbackRule: Rule = {
  id: 'style-fallback',
  name: 'Style Fallback',
  description: 'Add regular items when health items are scarce',
  scope: 'lunch_component',
  action: 'filter',
  conditions: { preferenceField: 'style', preferenceValues: ['health'] },
  parameters: { threshold: 2, fallbackStyle: 'regular', labelSuffix: '(Regular)' },
};

const excludedDishesRule: Rule = {
  id: 'excluded-dishes',
  name: 'Excluded Dishes Filter',
  description: 'Remove excluded dishes',
  scope: 'all_slots',
  action: 'filter',
  conditions: {},
};



// --- Property Tests ---

// Feature: meal-selection-rules-engine, Property 5: Filter rules produce only matching items
describe('Property 5: Filter rules produce only matching items', () => {
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  it('cuisine filter: every result item matches the user cuisine preference; "both" includes only north_indian-tagged items', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 0, maxLength: 20 }),
        arbUserPreferences(),
        (pool, prefs) => {
          const ctx = makeContext(prefs);
          const result = selector.filterPool(pool, [cuisineFilterRule], ctx);

          if (prefs.cuisine === 'both') {
            for (const item of result) {
              expect(item.cuisine.includes('north_indian')).toBe(true);
            }
            const expected = pool.filter((i) => i.cuisine.includes('north_indian'));
            expect(result.length).toBe(expected.length);
          } else {
            for (const item of result) {
              expect(item.cuisine.includes(prefs.cuisine)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('diet filter: every result item matches the user diet preference; "both" passes all', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 0, maxLength: 20 }),
        arbUserPreferences(),
        (pool, prefs) => {
          const ctx = makeContext(prefs);
          // Use diet-filter alone (no fallback)
          const result = selector.filterPool(pool, [dietFilterRule], ctx);

          if (prefs.diet === 'both') {
            expect(result.length).toBe(pool.length);
          } else {
            for (const item of result) {
              expect(item.diet).toBe(prefs.diet);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('style filter: every result item matches the user style preference', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 0, maxLength: 20 }),
        arbUserPreferences(),
        (pool, prefs) => {
          const ctx = makeContext(prefs);
          const result = selector.filterPool(pool, [styleFilterRule], ctx);

          for (const item of result) {
            expect(item.style).toBe(prefs.style);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 6: Multiple filters compose as intersection
describe('Property 6: Multiple filters compose as intersection', () => {
  // **Validates: Requirements 3.5**

  it('applying cuisine + diet filters together equals intersecting each applied independently', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 0, maxLength: 20 }),
        arbUserPreferences(),
        (pool, prefs) => {
          const ctx = makeContext(prefs);

          // Apply both together
          const combined = selector.filterPool(pool, [cuisineFilterRule, dietFilterRule], ctx);

          // Apply each independently and intersect
          const cuisineOnly = selector.filterPool(pool, [cuisineFilterRule], ctx);
          const dietOnly = selector.filterPool(pool, [dietFilterRule], ctx);
          const dietOnlyIds = new Set(dietOnly.map((i) => i.id));
          const intersection = cuisineOnly.filter((i) => dietOnlyIds.has(i.id));

          const combinedIds = new Set(combined.map((i) => i.id));
          const intersectionIds = new Set(intersection.map((i) => i.id));

          expect(combinedIds).toEqual(intersectionIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 7: Diet fallback behavior
describe('Property 7: Diet fallback behavior', () => {
  // **Validates: Requirements 4.1, 4.2**

  it('non_veg with diet-fallback includes both veg and non_veg; veg includes only veg', () => {
    const selector = makeSelector();

    // Generate a pool guaranteed to have both veg and non_veg items
    const arbMixedPool = fc.tuple(
      fc.array(arbMealComponent().map((c) => ({ ...c, diet: 'veg' as const })), { minLength: 1, maxLength: 10 }),
      fc.array(arbMealComponent().map((c) => ({ ...c, diet: 'non_veg' as const })), { minLength: 1, maxLength: 10 }),
    ).map(([veg, nonVeg]) => [...veg, ...nonVeg]);

    fc.assert(
      fc.property(
        arbMixedPool,
        fc.constantFrom('veg' as const, 'non_veg' as const),
        (pool, dietPref) => {
          const prefs = { cuisine: 'both' as const, diet: dietPref, style: 'health' as const };
          const ctx = makeContext(prefs);
          const rules = [dietFilterRule, dietFallbackRule];
          const result = selector.filterPool(pool, rules, ctx);

          if (dietPref === 'non_veg') {
            // Should include both veg and non_veg
            const diets = new Set(result.map((i) => i.diet));
            expect(diets.has('veg')).toBe(true);
            expect(diets.has('non_veg')).toBe(true);
            // All items should be retained
            expect(result.length).toBe(pool.length);
          } else {
            // veg: only veg items
            for (const item of result) {
              expect(item.diet).toBe('veg');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 8: Style fallback adds labeled regular items below threshold
describe('Property 8: Style fallback adds labeled regular items below threshold', () => {
  // **Validates: Requirements 5.1, 5.2**

  it('when health items in pool < threshold, regular items are added with "(Regular)" suffix', () => {
    const selector = makeSelector();

    // Generate a pool where health items count is 0 or 1 (below threshold of 2)
    // and there are some regular items available
    const arbPoolBelowThreshold = fc.tuple(
      // 0 or 1 health items
      fc.array(
        arbMealComponent().map((c) => ({ ...c, style: 'health' as const })),
        { minLength: 0, maxLength: 1 },
      ),
      // At least 1 regular item
      fc.array(
        arbMealComponent().map((c) => ({ ...c, style: 'regular' as const })),
        { minLength: 1, maxLength: 5 },
      ),
    ).map(([health, regular]) => [...health, ...regular]);

    fc.assert(
      fc.property(arbPoolBelowThreshold, (pool) => {
        const prefs = { cuisine: 'both' as const, diet: 'both' as const, style: 'health' as const };
        const ctx = makeContext(prefs);
        // style-filter first narrows to health only, then style-fallback adds regular with suffix
        const rules = [styleFilterRule, styleFallbackRule];
        const result = selector.filterPool(pool, rules, ctx);

        const healthItems = pool.filter((i) => i.style === 'health');
        const regularItems = pool.filter((i) => i.style === 'regular');

        // Health items should be in result as-is
        for (const h of healthItems) {
          expect(result.some((r) => r.id === h.id)).toBe(true);
        }

        // Regular items should appear with "(Regular)" suffix
        const suffixedItems = result.filter((r) => r.name.endsWith('(Regular)'));
        expect(suffixedItems.length).toBe(regularItems.length);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 9: Regular style users don't get style fallback
describe('Property 9: Regular style users don\'t get style fallback', () => {
  // **Validates: Requirements 5.4**

  it('when style is "regular", no items have "(Regular)" suffix', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 0, maxLength: 20 }),
        (pool) => {
          const prefs = { cuisine: 'both' as const, diet: 'both' as const, style: 'regular' as const };
          const ctx = makeContext(prefs);
          const rules = [styleFilterRule, styleFallbackRule];
          const result = selector.filterPool(pool, rules, ctx);

          for (const item of result) {
            expect(item.name.endsWith('(Regular)')).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 15: Excluded dishes are removed from all pools
describe('Property 15: Excluded dishes are removed from all pools', () => {
  // **Validates: Requirements 10.1, 10.2**

  it('no excluded ID appears in result; all non-excluded items are retained', () => {
    const selector = makeSelector();

    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 20 }),
        (pool) => {
          // Pick a random subset of IDs to exclude
          const allIds = pool.map((i) => i.id);
          const excludeCount = Math.max(1, Math.floor(allIds.length / 3));
          const excludedIds = allIds.slice(0, excludeCount);
          const excludedSet = new Set(excludedIds);

          const prefs = { cuisine: 'both' as const, diet: 'both' as const, style: 'health' as const };
          const ctx = makeContext(prefs, excludedIds);
          const result = selector.filterPool(pool, [excludedDishesRule], ctx);

          // No excluded item in result
          for (const item of result) {
            expect(excludedSet.has(item.id)).toBe(false);
          }

          // All non-excluded items are retained
          const resultIds = new Set(result.map((i) => i.id));
          for (const item of pool) {
            if (!excludedSet.has(item.id)) {
              expect(resultIds.has(item.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// --- Additional Rule Constants for Constraint Tests ---

const slidingWindowRule: Rule = {
  id: 'sliding-window', name: 'Sliding Window', description: 'Variety window',
  scope: 'all_slots', action: 'limit', conditions: { windowSize: 3 },
};

const ingredientOverlapRule: Rule = {
  id: 'ingredient-overlap', name: 'Ingredient Overlap', description: 'Avoid overlap',
  scope: 'lunch_component', action: 'constrain',
  conditions: { constraintType: 'ingredient_overlap', autoKeyCategories: ['protein'] },
};

const cuisineAlternationRule: Rule = {
  id: 'cuisine-alternation', name: 'Cuisine Alternation', description: 'Alternate cuisines',
  scope: 'all_slots', action: 'constrain',
  conditions: { constraintType: 'cuisine_alternation' },
  parameters: { pattern: 'alternate_by_day' },
};

const arbIngredient = fc.record({
  name: fc.constantFrom('chicken', 'egg', 'paneer', 'spinach', 'cauliflower', 'rice', 'dal', 'tomato'),
  quantity: fc.constant('100g'),
  category: fc.constant('protein'),
});

function arbMealComponentWithIngredients(): fc.Arbitrary<MealComponent> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    category: arbComponentCategory,
    cuisine: fc.subarray(['north_indian' as const, 'south_indian' as const], { minLength: 1 }),
    diet: fc.constantFrom('veg' as const, 'non_veg' as const),
    style: fc.constantFrom('health' as const, 'regular' as const),
    slots: fc.constantFrom(['lunch'] as ('lunch' | 'dinner')[], ['dinner'] as ('lunch' | 'dinner')[], ['lunch', 'dinner'] as ('lunch' | 'dinner')[]),
    ingredients: fc.array(arbIngredient, { minLength: 1, maxLength: 4 }),
    keyIngredient: fc.option(fc.constantFrom('chicken', 'egg', 'paneer', 'spinach', 'cauliflower', 'okra', 'potato', 'dal'), { nil: undefined }),
  });
}

// Feature: meal-selection-rules-engine, Property 10: Sliding window deprioritizes recent items
describe('Property 10: Sliding window deprioritizes recent items', () => {
  // **Validates: Requirements 6.1, 6.2**

  it('items in the window are at the END of the result (deprioritized), non-window items come first', () => {
    const selector = makeSelector();
    const windowSize = slidingWindowRule.conditions.windowSize ?? 3;

    fc.assert(
      fc.property(
        fc.uniqueArray(arbMealComponent(), { minLength: 4, maxLength: 15, selector: (c) => c.id }),
        (pool) => {
          // Put exactly windowSize IDs in the history (the effective window)
          const historyIds = pool.slice(0, Math.min(windowSize, pool.length - 1)).map((c) => c.id);
          const windowSet = new Set(historyIds);

          const ctx = makeContext(
            { cuisine: 'both', diet: 'both', style: 'health' },
          );
          ctx.history = { base: historyIds };

          const result = selector.applySlidingWindow(pool, slidingWindowRule, ctx);

          // Result should contain all items
          expect(result.length).toBe(pool.length);

          // Non-window items should come before window items
          const nonWindowCount = pool.filter((c) => !windowSet.has(c.id)).length;
          const resultNonWindow = result.slice(0, nonWindowCount);
          for (const item of resultNonWindow) {
            expect(windowSet.has(item.id)).toBe(false);
          }

          // Window items should be at the end
          const resultWindow = result.slice(nonWindowCount);
          for (const item of resultWindow) {
            expect(windowSet.has(item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when ALL items are in the window, the full pool is returned (progressive relaxation)', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 10 }),
        (pool) => {
          const allIds = pool.map((c) => c.id);

          const ctx = makeContext(
            { cuisine: 'both', diet: 'both', style: 'health' },
          );
          ctx.history = { base: allIds };

          const result = selector.applySlidingWindow(pool, slidingWindowRule, ctx);

          // Progressive relaxation: full pool returned
          expect(result.length).toBe(pool.length);
          const resultIds = new Set(result.map((r) => r.id));
          for (const item of pool) {
            expect(resultIds.has(item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 11: Progressive relaxation ensures selection always succeeds
describe('Property 11: Progressive relaxation ensures selection always succeeds', () => {
  // **Validates: Requirements 6.4, 7.2, 8.4**

  it('applySlidingWindow never returns empty for a non-empty pool', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 15 }),
        (pool) => {
          // All items in window — forces relaxation
          const allIds = pool.map((c) => c.id);
          const ctx = makeContext({ cuisine: 'both', diet: 'both', style: 'health' });
          ctx.history = { base: allIds };

          const result = selector.applySlidingWindow(pool, slidingWindowRule, ctx);
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applySameDayDedup never returns empty for a non-empty pool', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 1, maxLength: 15 }),
        (pool) => {
          // All items in sameDaySelections — forces relaxation
          const allIds = pool.map((c) => c.id);
          const ctx = makeContext({ cuisine: 'both', diet: 'both', style: 'health' });
          ctx.sameDaySelections = { base: allIds };

          const result = selector.applySameDayDedup(pool, ctx);
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applyIngredientOverlap never returns empty for a non-empty pool', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponentWithIngredients(), { minLength: 1, maxLength: 10 }),
        arbMealComponentWithIngredients(),
        (pool, refComponent) => {
          const result = selector.applyIngredientOverlap(pool, ingredientOverlapRule, refComponent);
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 12: Same-day dedup excludes lunch selections from dinner
describe('Property 12: Same-day dedup excludes lunch selections from dinner', () => {
  // **Validates: Requirements 7.1**

  it('items in sameDaySelections are NOT in the strict result (unless relaxation kicks in)', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.array(arbMealComponent(), { minLength: 2, maxLength: 15 }),
        (pool) => {
          // Pick a subset of IDs as same-day selections (not all, to avoid relaxation)
          const sameDayCount = Math.max(1, Math.floor(pool.length / 3));
          const sameDayIds = pool.slice(0, sameDayCount).map((c) => c.id);
          const sameDaySet = new Set(sameDayIds);
          const nonSameDayCount = pool.filter((c) => !sameDaySet.has(c.id)).length;

          const ctx = makeContext({ cuisine: 'both', diet: 'both', style: 'health' });
          ctx.sameDaySelections = { gravy: sameDayIds };

          const result = selector.applySameDayDedup(pool, ctx);

          if (nonSameDayCount > 0) {
            // Strict mode: no same-day items in result
            for (const item of result) {
              expect(sameDaySet.has(item.id)).toBe(false);
            }
          } else {
            // Relaxation: full pool returned
            expect(result.length).toBe(pool.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 13: Adjacent components avoid key ingredient overlap
describe('Property 13: Adjacent components avoid key ingredient overlap', () => {
  // **Validates: Requirements 8.1, 8.2**

  it('no item in the result shares key ingredients with the reference (unless relaxation)', () => {
    const selector = makeSelector();

    // Protein groups map mirrors MealSelector.PROTEIN_GROUPS for conflict checking
    const PROTEIN_GROUPS: Record<string, string> = {
      chicken: 'poultry',
      'chicken mince': 'poultry',
      fish: 'seafood',
      prawns: 'seafood',
      eggs: 'egg',
      paneer: 'dairy_protein',
      tofu: 'plant_protein',
    };

    function getProteinGroups(component: MealComponent): Set<string> {
      const groups = new Set<string>();
      for (const ing of component.ingredients) {
        const name = ing.name.toLowerCase();
        for (const [keyword, group] of Object.entries(PROTEIN_GROUPS)) {
          if (name.includes(keyword)) groups.add(group);
        }
      }
      return groups;
    }

    function hasProteinConflict(a: MealComponent, b: MealComponent): boolean {
      const groupsA = getProteinGroups(a);
      const groupsB = getProteinGroups(b);
      if (groupsA.size === 0 || groupsB.size === 0) return false;
      for (const g of groupsA) {
        if (groupsB.has(g)) return false;
      }
      return true;
    }

    /** Extract key ingredients: autoKeyCategories (protein) + component.keyIngredient */
    function extractKeys(component: MealComponent): Set<string> {
      const keys = new Set<string>();
      for (const ing of component.ingredients) {
        if (ing.category.toLowerCase() === 'protein') {
          keys.add(ing.name.toLowerCase());
        }
      }
      if (component.keyIngredient) {
        keys.add(component.keyIngredient.toLowerCase());
      }
      return keys;
    }

    fc.assert(
      fc.property(
        fc.array(arbMealComponentWithIngredients(), { minLength: 2, maxLength: 10 }),
        arbMealComponentWithIngredients(),
        (pool, refComponent) => {
          const result = selector.applyIngredientOverlap(pool, ingredientOverlapRule, refComponent);

          const refKeys = extractKeys(refComponent);

          // Simulate the same filtering logic as applyIngredientOverlap
          const strictFiltered = pool.filter((item) => {
            if (hasProteinConflict(item, refComponent)) return false;
            if (refKeys.size > 0) {
              const itemKeys = extractKeys(item);
              for (const k of itemKeys) {
                if (refKeys.has(k)) return false;
              }
            }
            return true;
          });

          if (strictFiltered.length > 0) {
            // Strict mode: no overlapping key ingredients and no protein conflicts
            for (const item of result) {
              expect(hasProteinConflict(item, refComponent)).toBe(false);
              if (refKeys.size > 0) {
                const itemKeys = extractKeys(item);
                const overlap = [...itemKeys].some((k) => refKeys.has(k));
                expect(overlap).toBe(false);
              }
            }
          } else {
            // Relaxation: full pool returned
            expect(result.length).toBe(pool.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 14: Cuisine assignment matches preference pattern
describe('Property 14: Cuisine assignment matches preference pattern', () => {
  // **Validates: Requirements 9.1, 9.2**

  it('when preference is "both", all days get north_indian (NI + crossover items)', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        (startDay) => {
          const prefs = { cuisine: 'both' as const, diet: 'both' as const, style: 'health' as const };
          const ctx = makeContext(prefs);
          const rules = [cuisineAlternationRule];

          for (let d = startDay; d < startDay + 7; d++) {
            expect(selector.getCuisineForDay(d, rules, ctx)).toBe('north_indian');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when preference is single cuisine, all days get that cuisine', () => {
    const selector = makeSelector();
    fc.assert(
      fc.property(
        fc.constantFrom('north_indian' as const, 'south_indian' as const),
        fc.integer({ min: 0, max: 6 }),
        (singleCuisine, startDay) => {
          const prefs = { cuisine: singleCuisine, diet: 'both' as const, style: 'health' as const };
          const ctx = makeContext(prefs);
          const rules = [cuisineAlternationRule];

          for (let d = startDay; d < startDay + 7; d++) {
            const cuisine = selector.getCuisineForDay(d, rules, ctx);
            expect(cuisine).toBe(singleCuisine);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
