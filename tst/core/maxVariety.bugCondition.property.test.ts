import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateWeeklyPlan } from '../../src/core/planGenerator';
import type { Meal, MealComponent, Ingredient, ComponentCategory } from '../../src/core/types';

// ============================================================
// Property 1: Bug Condition — Full Pool Exhaustion Before Repeats
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
//
// EXPLORATION TEST: Expected to FAIL on unfixed code.
// Failure confirms the bug exists — the sliding window (RECENT_WINDOW=3)
// in generateWeeklyPlan allows components to repeat after day 4 even
// when unused components remain in the pool.
//
// On FIXED code this test should PASS, because the cumulative used-set
// tracking ensures all pool items are used before any repeats.
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
 * Build a component pool with `count` unique items for a given category.
 * Each component gets a unique signature ingredient to avoid overlap filtering.
 */
function buildCategoryPool(
  category: ComponentCategory,
  count: number,
  prefix: string,
): MealComponent[] {
  const veggieNames = [
    'Potato', 'Cauliflower', 'Spinach', 'Okra', 'Cabbage',
    'Carrot', 'Beetroot', 'Brinjal', 'Drumstick', 'Snake Gourd',
    'Ivy Gourd', 'Ash Gourd', 'Raw Banana', 'Ridge Gourd', 'Bottle Gourd',
  ];
  return Array.from({ length: count }, (_, i) =>
    makeComponent(
      `${prefix}-${category}-${String(i).padStart(3, '0')}`,
      `${prefix} ${category} ${i}`,
      category,
      [makeIngredient(veggieNames[i % veggieNames.length])],
    ),
  );
}

// ── Test Data ───────────────────────────────────────────────

// 7 breakfasts (enough for 7 days)
const breakfasts: Meal[] = Array.from({ length: 7 }, (_, i) =>
  makeMeal(`breakfast-${i}`, `Breakfast ${i}`),
);

// Build component pools — gravies have >= 7 items (the category-slot we'll check)
// Other categories have enough items to compose valid meals
const GRAVY_COUNT = 10; // >= 7, so all 7 days should have unique gravies

const bases = buildCategoryPool('base', 8, 'test');
const gravies = buildCategoryPool('gravy', GRAVY_COUNT, 'test');
const dryVeggies = buildCategoryPool('dry_veggie', 8, 'test');
const sides = buildCategoryPool('side', 4, 'test');

const allComponents: MealComponent[] = [...bases, ...gravies, ...dryVeggies, ...sides];

const preferences = { cuisine: 'north_indian', diet: 'veg', style: 'health' };

describe('Property 1: Bug Condition — Full Pool Exhaustion Before Repeats', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
   *
   * For any category-slot where the pool has N >= 7 eligible components,
   * the generated 7-day plan SHALL contain 7 unique component IDs for
   * that category-slot (zero repeats).
   *
   * This test generates plans using generateWeeklyPlan with a gravy pool
   * of 10 items (>= 7). Due to the sliding window of 3 in the unfixed code,
   * gravies used on day 1 become eligible again on day 5, causing premature
   * repeats while unused gravies remain in the pool.
   *
   * EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
   */
  it('all 7 days should have unique component IDs for category-slots with pool >= 7', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        (_seed) => {
          const plan = generateWeeklyPlan(breakfasts, allComponents, preferences);

          expect(plan).toHaveLength(7);

          // Check each slot (lunch, dinner) for each category with pool >= 7
          for (const slot of ['lunch', 'dinner'] as const) {
            // Gravies have pool size 10 (>= 7), so all 7 days must have unique gravies
            const gravyIds = plan.map(day => {
              const meal = day[slot];
              const gravy = meal.components.find(c => c.category === 'gravy');
              return gravy?.id;
            });

            const uniqueGravyIds = new Set(gravyIds.filter(Boolean));

            if (uniqueGravyIds.size < 7) {
              // Find the repeated gravy to report a clear counterexample
              const idCounts = new Map<string, number>();
              for (const id of gravyIds) {
                if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
              }
              const repeats = [...idCounts.entries()]
                .filter(([, count]) => count > 1)
                .map(([id, count]) => `${id} (×${count})`);

              throw new Error(
                `${slot} gravies: only ${uniqueGravyIds.size}/7 unique across 7 days ` +
                `(pool size=${GRAVY_COUNT}). Repeats: [${repeats.join(', ')}]. ` +
                `IDs by day: [${gravyIds.join(', ')}]`,
              );
            }

            // Also check bases (pool size 8 >= 7)
            const baseIds = plan.map(day => {
              const meal = day[slot];
              const base = meal.components.find(c => c.category === 'base');
              return base?.id;
            });

            const uniqueBaseIds = new Set(baseIds.filter(Boolean));

            if (uniqueBaseIds.size < 7) {
              const idCounts = new Map<string, number>();
              for (const id of baseIds) {
                if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
              }
              const repeats = [...idCounts.entries()]
                .filter(([, count]) => count > 1)
                .map(([id, count]) => `${id} (×${count})`);

              throw new Error(
                `${slot} bases: only ${uniqueBaseIds.size}/7 unique across 7 days ` +
                `(pool size=8). Repeats: [${repeats.join(', ')}]. ` +
                `IDs by day: [${baseIds.join(', ')}]`,
              );
            }

            // Also check dry_veggies (pool size 8 >= 7)
            const dryVeggieIds = plan.map(day => {
              const meal = day[slot];
              const dv = meal.components.find(c => c.category === 'dry_veggie');
              return dv?.id;
            });

            const uniqueDryVeggieIds = new Set(dryVeggieIds.filter(Boolean));

            if (uniqueDryVeggieIds.size < 7) {
              const idCounts = new Map<string, number>();
              for (const id of dryVeggieIds) {
                if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
              }
              const repeats = [...idCounts.entries()]
                .filter(([, count]) => count > 1)
                .map(([id, count]) => `${id} (×${count})`);

              throw new Error(
                `${slot} dry_veggies: only ${uniqueDryVeggieIds.size}/7 unique across 7 days ` +
                `(pool size=8). Repeats: [${repeats.join(', ')}]. ` +
                `IDs by day: [${dryVeggieIds.join(', ')}]`,
              );
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
