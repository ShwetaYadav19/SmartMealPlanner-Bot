import { describe, it, expect } from 'vitest';
import { generateWeeklyPlan } from '../../src/core/planGenerator';
import { MealSelector } from '../../src/core/mealSelector';
import type {
  Meal,
  MealComponent,
  Ingredient,
  ComponentCategory,
  Rule,
  RuleEvaluationContext,
} from '../../src/core/types';
import type { RulesRepository, MealRepository, MealComponentRepository } from '../../src/core/ports';

// ── Helpers ─────────────────────────────────────────────────

function makeIngredient(name: string, category = 'vegetables'): Ingredient {
  return { name, quantity: '200g', category };
}

function makeComponent(
  id: string,
  name: string,
  category: ComponentCategory,
  ingredients: Ingredient[],
  overrides: Partial<MealComponent> = {},
): MealComponent {
  return {
    id,
    name,
    category,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients,
    ...overrides,
  };
}

function makeMeal(id: string, name: string): Meal {
  return {
    id,
    name,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'health',
    slots: ['breakfast'],
    ingredients: [makeIngredient('Oats', 'grains')],
  };
}

const UNIQUE_VEGGIES = [
  'Potato', 'Cauliflower', 'Spinach', 'Okra', 'Cabbage',
  'Carrot', 'Beetroot', 'Brinjal', 'Drumstick', 'Snake Gourd',
  'Ivy Gourd', 'Ash Gourd', 'Raw Banana', 'Ridge Gourd', 'Bottle Gourd',
];

function buildCategoryPool(
  category: ComponentCategory,
  count: number,
  prefix: string,
): MealComponent[] {
  return Array.from({ length: count }, (_, i) =>
    makeComponent(
      `${prefix}-${category}-${String(i).padStart(3, '0')}`,
      `${prefix} ${category} ${i}`,
      category,
      [makeIngredient(UNIQUE_VEGGIES[i % UNIQUE_VEGGIES.length])],
    ),
  );
}

const breakfasts: Meal[] = Array.from({ length: 7 }, (_, i) =>
  makeMeal(`breakfast-${i}`, `Breakfast ${i}`),
);

const preferences = { cuisine: 'north_indian', diet: 'veg', style: 'health' };


// ── (a) Pool of exactly 7 produces 7 unique components ─────

describe('Max Variety Unit Tests', () => {
  describe('(a) Pool of exactly 7 for gravy produces 7 unique components', () => {
    it('lunch slot: 7 gravies → 7 unique gravy IDs across 7 days', () => {
      const components: MealComponent[] = [
        ...buildCategoryPool('base', 8, 'a'),
        ...buildCategoryPool('gravy', 7, 'a'),
        ...buildCategoryPool('dry_veggie', 8, 'a'),
        ...buildCategoryPool('side', 4, 'a'),
      ];

      const plan = generateWeeklyPlan(breakfasts, components, preferences);
      expect(plan).toHaveLength(7);

      const lunchGravyIds = plan.map(day =>
        day.lunch.components.find(c => c.category === 'gravy')?.id,
      );
      const uniqueIds = new Set(lunchGravyIds.filter(Boolean));
      expect(uniqueIds.size).toBe(7);
    });
  });

  // ── (b) Pool of 5 produces 5 unique then resets ────────────

  describe('(b) Pool of 5 produces 5 unique then resets', () => {
    it('lunch slot: first 5 days have unique gravy IDs, days 6-7 reuse from pool', () => {
      const components: MealComponent[] = [
        ...buildCategoryPool('base', 8, 'b'),
        ...buildCategoryPool('gravy', 5, 'b'),
        ...buildCategoryPool('dry_veggie', 8, 'b'),
        ...buildCategoryPool('side', 4, 'b'),
      ];

      const plan = generateWeeklyPlan(breakfasts, components, preferences);
      expect(plan).toHaveLength(7);

      const lunchGravyIds = plan.map(day =>
        day.lunch.components.find(c => c.category === 'gravy')?.id,
      );

      // First 5 days should all be unique (pool exhaustion before reset)
      const first5 = lunchGravyIds.slice(0, 5);
      const uniqueFirst5 = new Set(first5.filter(Boolean));
      expect(uniqueFirst5.size).toBe(5);

      // Days 6-7 reuse from the pool (after reset)
      const last2 = lunchGravyIds.slice(5);
      for (const id of last2) {
        expect(id).toBeDefined();
        // The reused IDs must come from the original pool
        expect(uniqueFirst5.has(id!)).toBe(true);
      }
    });
  });

  // ── (c) Pool of 1 repeats every day without error ──────────

  describe('(c) Pool of 1 repeats every day without error', () => {
    it('generates a valid 7-day plan when gravy pool has only 1 item', () => {
      const components: MealComponent[] = [
        ...buildCategoryPool('base', 8, 'c'),
        ...buildCategoryPool('gravy', 1, 'c'),
        ...buildCategoryPool('dry_veggie', 8, 'c'),
        ...buildCategoryPool('side', 4, 'c'),
      ];

      const plan = generateWeeklyPlan(breakfasts, components, preferences);
      expect(plan).toHaveLength(7);

      const lunchGravyIds = plan.map(day =>
        day.lunch.components.find(c => c.category === 'gravy')?.id,
      );

      // All 7 days should have the same (only) gravy
      const uniqueIds = new Set(lunchGravyIds.filter(Boolean));
      expect(uniqueIds.size).toBe(1);

      // Every day should have a valid gravy component
      for (const id of lunchGravyIds) {
        expect(id).toBeDefined();
      }
    });
  });

  // ── (d) applySlidingWindow with full history deprioritizes all used ──

  describe('(d) applySlidingWindow with full history deprioritizes all used components', () => {
    // Create a minimal MealSelector with stub repositories
    const stubRulesRepo: RulesRepository = { getRules: async () => [] };
    const stubMealRepo: MealRepository = {
      getMeals: async () => [],
      getMealById: async () => null,
    };
    const stubComponentRepo: MealComponentRepository = {
      getComponents: async () => [],
    };
    const selector = new MealSelector(stubRulesRepo, stubMealRepo, stubComponentRepo);

    const dummyRule: Rule = {
      id: 'sliding-window',
      name: 'Sliding Window',
      description: 'test',
      scope: 'lunch_component',
      action: 'limit',
      conditions: { windowSize: 3 },
    };

    it('deprioritizes all items in history, not just windowed ones', () => {
      const pool = buildCategoryPool('gravy', 5, 'sw');

      // Put first 3 items in history (simulating 3 days of usage)
      const context: RuleEvaluationContext = {
        userPreferences: { cuisine: 'north_indian', diet: 'veg', style: 'health' },
        excludedDishIds: [],
        slot: 'lunch',
        dayIndex: 3,
        history: { gravy: [pool[0].id, pool[1].id, pool[2].id] },
        sameDaySelections: {},
      };

      const result = selector.applySlidingWindow(pool, dummyRule, context);

      // Non-recent items (pool[3], pool[4]) should come first
      const nonRecentIds = new Set([pool[3].id, pool[4].id]);
      const recentIds = new Set([pool[0].id, pool[1].id, pool[2].id]);

      // First items in result should be non-recent
      for (let i = 0; i < 2; i++) {
        expect(nonRecentIds.has(result[i].id)).toBe(true);
      }
      // Last items should be recent (deprioritized)
      for (let i = 2; i < 5; i++) {
        expect(recentIds.has(result[i].id)).toBe(true);
      }
    });

    it('returns full pool when all items are in history (progressive relaxation)', () => {
      const pool = buildCategoryPool('gravy', 4, 'sw2');

      // All 4 items are in history — pool is fully exhausted
      const context: RuleEvaluationContext = {
        userPreferences: { cuisine: 'north_indian', diet: 'veg', style: 'health' },
        excludedDishIds: [],
        slot: 'lunch',
        dayIndex: 4,
        history: { gravy: pool.map(c => c.id) },
        sameDaySelections: {},
      };

      const result = selector.applySlidingWindow(pool, dummyRule, context);

      // Progressive relaxation: all items recent → return full pool
      expect(result).toHaveLength(4);
      const resultIds = new Set(result.map(c => c.id));
      const poolIds = new Set(pool.map(c => c.id));
      expect(resultIds).toEqual(poolIds);
    });
  });
});
