import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateWeeklyPlan } from '../../src/core/planGenerator';
import type { Meal, MealComponent, Ingredient, ComponentCategory } from '../../src/core/types';

// ============================================================
// Property 1: Bug Condition — Full Pool Exhaustion Before Repeats
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
//
// FIX CHECK TEST: Expected to PASS on fixed code.
// Generates weekly plans with varying pool sizes (7–15) per
// category-slot and asserts that:
//   - For pools >= 7: all 7 days have unique component IDs
//   - For pools < 7: the first repeat index equals the pool size
//
// Note: Same-day dedup (requirement 3.1) means dinner's effective
// pool is reduced by 1 per day (the lunch pick is excluded). The
// test accounts for this by using pool sizes >= 8 for the >= 7
// uniqueness assertion on dinner, and by checking lunch (which
// composes first and has no same-day constraint) independently.
// ============================================================

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

/**
 * Unique veggie names to avoid ingredient-overlap filtering.
 * Each component gets a distinct ingredient so overlap avoidance
 * doesn't interfere with variety assertions.
 */
const UNIQUE_VEGGIES = [
  'Potato', 'Cauliflower', 'Spinach', 'Okra', 'Cabbage',
  'Carrot', 'Beetroot', 'Brinjal', 'Drumstick', 'Snake Gourd',
  'Ivy Gourd', 'Ash Gourd', 'Raw Banana', 'Ridge Gourd', 'Bottle Gourd',
];

/**
 * Build a component pool with `count` unique items for a given category.
 * Each component gets a unique signature ingredient to avoid overlap filtering.
 */
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

// ── Shared test data ────────────────────────────────────────

// 7 breakfasts (enough for 7 days)
const breakfasts: Meal[] = Array.from({ length: 7 }, (_, i) =>
  makeMeal(`breakfast-${i}`, `Breakfast ${i}`),
);

const preferences = { cuisine: 'north_indian', diet: 'veg', style: 'health' };

/**
 * Find the first index where a component ID repeats in a sequence.
 * Returns the sequence length if no repeat is found.
 */
function firstRepeatIndex(ids: (string | undefined)[]): number {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    if (seen.has(id)) return i;
    seen.add(id);
  }
  return ids.length;
}

// ── Tests ───────────────────────────────────────────────────

describe('Property 1: Bug Condition — Full Pool Exhaustion Before Repeats (Fix Check)', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
   *
   * For varying pool sizes (8–15) per category-slot, the generated
   * 7-day plan SHALL contain 7 unique component IDs for BOTH lunch
   * and dinner. Pool sizes >= 8 ensure same-day dedup (which blocks
   * 1 item per day for dinner) still leaves >= 7 unique candidates.
   */
  it('pools >= 8 produce 7 unique IDs per category-slot across both lunch and dinner', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: 8, max: 15 }),
          gravy: fc.integer({ min: 8, max: 15 }),
          dry_veggie: fc.integer({ min: 8, max: 15 }),
          side: fc.integer({ min: 8, max: 15 }),
        }),
        (poolSizes) => {
          const components: MealComponent[] = [
            ...buildCategoryPool('base', poolSizes.base, 'fc'),
            ...buildCategoryPool('gravy', poolSizes.gravy, 'fc'),
            ...buildCategoryPool('dry_veggie', poolSizes.dry_veggie, 'fc'),
            ...buildCategoryPool('side', poolSizes.side, 'fc'),
          ];

          const plan = generateWeeklyPlan(breakfasts, components, preferences);

          expect(plan).toHaveLength(7);

          for (const slot of ['lunch', 'dinner'] as const) {
            for (const category of ['base', 'gravy', 'dry_veggie', 'side'] as ComponentCategory[]) {
              const poolSize = poolSizes[category];

              const ids = plan.map(day => {
                const meal = day[slot];
                const comp = meal.components.find(c => c.category === category);
                return comp?.id;
              });

              const uniqueIds = new Set(ids.filter(Boolean));

              // Pool >= 8 means even with same-day dedup, 7 unique IDs are achievable
              if (uniqueIds.size < 7) {
                const idCounts = new Map<string, number>();
                for (const id of ids) {
                  if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
                }
                const repeats = [...idCounts.entries()]
                  .filter(([, count]) => count > 1)
                  .map(([id, count]) => `${id} (×${count})`);

                throw new Error(
                  `${slot} ${category}: only ${uniqueIds.size}/7 unique across 7 days ` +
                  `(pool size=${poolSize}). Repeats: [${repeats.join(', ')}]. ` +
                  `IDs by day: [${ids.join(', ')}]`,
                );
              }
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Lunch composes first (no same-day dedup constraint), so even with
   * pool size exactly 7, all 7 days should have unique lunch component IDs.
   */
  it('lunch slot with pool size 7 produces 7 unique IDs per category', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        (_seed) => {
          const components: MealComponent[] = [
            ...buildCategoryPool('base', 7, 'l7'),
            ...buildCategoryPool('gravy', 7, 'l7'),
            ...buildCategoryPool('dry_veggie', 7, 'l7'),
            // sides have a small pool — not checked for uniqueness here
            ...buildCategoryPool('side', 7, 'l7'),
          ];

          const plan = generateWeeklyPlan(breakfasts, components, preferences);

          expect(plan).toHaveLength(7);

          for (const category of ['base', 'gravy', 'dry_veggie'] as ComponentCategory[]) {
            const ids = plan.map(day => {
              const meal = day.lunch;
              const comp = meal.components.find(c => c.category === category);
              return comp?.id;
            });

            const uniqueIds = new Set(ids.filter(Boolean));

            if (uniqueIds.size < 7) {
              const idCounts = new Map<string, number>();
              for (const id of ids) {
                if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
              }
              const repeats = [...idCounts.entries()]
                .filter(([, count]) => count > 1)
                .map(([id, count]) => `${id} (×${count})`);

              throw new Error(
                `lunch ${category}: only ${uniqueIds.size}/7 unique across 7 days ` +
                `(pool size=7). Repeats: [${repeats.join(', ')}]. ` +
                `IDs by day: [${ids.join(', ')}]`,
              );
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5, 3.5**
   *
   * For small pools (3–6), the first repeat index should be >= the pool
   * size — all items are used before any repeat begins. Checked on the
   * lunch slot (no same-day dedup interference).
   */
  it('small pools (< 7) exhaust all items before any repeat (lunch slot)', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: 3, max: 6 }),
          gravy: fc.integer({ min: 3, max: 6 }),
          dry_veggie: fc.integer({ min: 3, max: 6 }),
          side: fc.integer({ min: 3, max: 6 }),
        }),
        (poolSizes) => {
          const components: MealComponent[] = [
            ...buildCategoryPool('base', poolSizes.base, 'sm'),
            ...buildCategoryPool('gravy', poolSizes.gravy, 'sm'),
            ...buildCategoryPool('dry_veggie', poolSizes.dry_veggie, 'sm'),
            ...buildCategoryPool('side', poolSizes.side, 'sm'),
          ];

          const plan = generateWeeklyPlan(breakfasts, components, preferences);

          expect(plan).toHaveLength(7);

          // Check lunch slot only — dinner has same-day dedup interference
          for (const category of ['base', 'gravy', 'dry_veggie'] as ComponentCategory[]) {
            const poolSize = poolSizes[category];

            const ids = plan.map(day => {
              const meal = day.lunch;
              const comp = meal.components.find(c => c.category === category);
              return comp?.id;
            });

            const repeatIdx = firstRepeatIndex(ids);

            if (repeatIdx < poolSize) {
              throw new Error(
                `lunch ${category}: first repeat at index ${repeatIdx}, ` +
                `expected >= ${poolSize} (pool size=${poolSize}). ` +
                `IDs by day: [${ids.join(', ')}]`,
              );
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
