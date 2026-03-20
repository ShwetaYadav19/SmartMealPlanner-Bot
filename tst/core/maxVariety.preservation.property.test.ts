import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateWeeklyPlan, getSignatureIngredientNames, isProteinDish } from '../../src/core/planGenerator';
import type { Meal, MealComponent, Ingredient, ComponentCategory } from '../../src/core/types';

// ============================================================
// Property 2: Preservation — Existing Constraint Behavior Unchanged
// **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6**
//
// PRESERVATION TESTS: Expected to PASS on fixed code.
// These verify that the max-variety fix (cumulative used sets with
// pool-exhaustion reset) does not regress existing constraints:
//   (a) Same-day dedup for base/gravy/dry_veggie between lunch & dinner
//   (b) No ingredient overlap between gravy and dry_veggie within a meal
//   (c) No cross-group protein conflicts within a meal
//   (d) Plans generate successfully without errors for various pool sizes
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
 * Unique veggie names — each component gets a distinct ingredient
 * so overlap avoidance doesn't interfere with variety assertions.
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
      [makeIngredient(`${category}_${UNIQUE_VEGGIES[i % UNIQUE_VEGGIES.length]}`)],
    ),
  );
}

/**
 * Build a mixed pool that includes both veg and non-veg protein components.
 * Gravies include protein dishes (chicken, fish) and veg dishes.
 * Dry veggies include protein dishes (prawns, paneer) and veg dishes.
 */
function buildMixedProteinPool(gravyCount: number, dryVeggieCount: number, prefix: string): {
  gravies: MealComponent[];
  dryVeggies: MealComponent[];
} {
  const proteinGravyIngredients = [
    [makeIngredient('Chicken', 'protein'), makeIngredient('Onion')],
    [makeIngredient('Fish', 'protein'), makeIngredient('Coconut Milk', 'dairy')],
  ];
  const proteinDryIngredients = [
    [makeIngredient('Prawns', 'protein'), makeIngredient('Chilli Powder', 'spices')],
    [makeIngredient('Paneer', 'protein'), makeIngredient('Capsicum')],
  ];

  const gravies: MealComponent[] = [];
  for (let i = 0; i < gravyCount; i++) {
    if (i < proteinGravyIngredients.length) {
      gravies.push(makeComponent(
        `${prefix}-gravy-prot-${i}`, `${prefix} Protein Gravy ${i}`, 'gravy',
        proteinGravyIngredients[i],
        { diet: 'non_veg' },
      ));
    } else {
      gravies.push(makeComponent(
        `${prefix}-gravy-veg-${i}`, `${prefix} Veg Gravy ${i}`, 'gravy',
        [makeIngredient(UNIQUE_VEGGIES[i % UNIQUE_VEGGIES.length])],
      ));
    }
  }

  const dryVeggies: MealComponent[] = [];
  for (let i = 0; i < dryVeggieCount; i++) {
    if (i < proteinDryIngredients.length) {
      dryVeggies.push(makeComponent(
        `${prefix}-dry-prot-${i}`, `${prefix} Protein Dry ${i}`, 'dry_veggie',
        proteinDryIngredients[i],
        { diet: 'non_veg' },
      ));
    } else {
      dryVeggies.push(makeComponent(
        `${prefix}-dry-veg-${i}`, `${prefix} Veg Dry ${i}`, 'dry_veggie',
        [makeIngredient(UNIQUE_VEGGIES[(i + 5) % UNIQUE_VEGGIES.length])],
      ));
    }
  }

  return { gravies, dryVeggies };
}

// 7 breakfasts (enough for 7 days)
const breakfasts: Meal[] = Array.from({ length: 7 }, (_, i) =>
  makeMeal(`breakfast-${i}`, `Breakfast ${i}`),
);

const preferences = { cuisine: 'north_indian', diet: 'veg', style: 'health' };

/**
 * Protein groups — items within the same group are compatible,
 * but mixing across groups in a single meal is undesirable.
 */
const PROTEIN_GROUPS: Record<string, string> = {
  chicken: 'poultry',
  'chicken mince': 'poultry',
  fish: 'seafood',
  prawns: 'seafood',
  eggs: 'egg',
  paneer: 'dairy_protein',
  tofu: 'plant_protein',
};

/**
 * Extract the protein group(s) present in a component's ingredients.
 */
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

/**
 * Check if two components have conflicting proteins (different protein groups).
 */
function hasProteinConflict(a: MealComponent, b: MealComponent): boolean {
  const groupsA = getProteinGroups(a);
  const groupsB = getProteinGroups(b);
  if (groupsA.size === 0 || groupsB.size === 0) return false;
  for (const g of groupsA) {
    if (groupsB.has(g)) return false;
  }
  return true;
}

// ── Tests ───────────────────────────────────────────────────

describe('Property 2: Preservation — Existing Constraint Behavior Unchanged', () => {

  /**
   * **Validates: Requirements 3.1**
   *
   * For any generated 7-day plan, base, gravy, and dry_veggie must
   * differ between lunch and dinner on the same day. This is the
   * same-day dedup constraint that must be preserved after the fix.
   */
  it('(a) same-day dedup: base/gravy/dry_veggie differ between lunch and dinner', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: 8, max: 15 }),
          gravy: fc.integer({ min: 8, max: 15 }),
          dry_veggie: fc.integer({ min: 8, max: 15 }),
          side: fc.integer({ min: 4, max: 8 }),
        }),
        (poolSizes) => {
          const components: MealComponent[] = [
            ...buildCategoryPool('base', poolSizes.base, 'dd'),
            ...buildCategoryPool('gravy', poolSizes.gravy, 'dd'),
            ...buildCategoryPool('dry_veggie', poolSizes.dry_veggie, 'dd'),
            ...buildCategoryPool('side', poolSizes.side, 'dd'),
          ];

          const plan = generateWeeklyPlan(breakfasts, components, preferences);

          expect(plan).toHaveLength(7);

          for (const day of plan) {
            for (const category of ['base', 'gravy', 'dry_veggie'] as ComponentCategory[]) {
              const lunchComp = day.lunch.components.find(c => c.category === category);
              const dinnerComp = day.dinner.components.find(c => c.category === category);

              if (lunchComp && dinnerComp) {
                expect(lunchComp.id).not.toBe(dinnerComp.id);
              }
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * For any generated meal, gravy and dry_veggie should not share
   * signature ingredients (protein, lentils, vegetables). This is
   * the ingredient overlap avoidance constraint.
   *
   * Note: This is a soft constraint with progressive relaxation —
   * when the pool is too small, overlap may occur. We test with
   * pools large enough (>= 8) that relaxation should not be needed.
   */
  it('(b) no ingredient overlap between gravy and dry_veggie within a meal', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: 8, max: 12 }),
          gravy: fc.integer({ min: 8, max: 12 }),
          dry_veggie: fc.integer({ min: 8, max: 12 }),
          side: fc.integer({ min: 4, max: 8 }),
        }),
        (poolSizes) => {
          const components: MealComponent[] = [
            ...buildCategoryPool('base', poolSizes.base, 'io'),
            ...buildCategoryPool('gravy', poolSizes.gravy, 'io'),
            ...buildCategoryPool('dry_veggie', poolSizes.dry_veggie, 'io'),
            ...buildCategoryPool('side', poolSizes.side, 'io'),
          ];

          const plan = generateWeeklyPlan(breakfasts, components, preferences);

          for (const day of plan) {
            for (const slot of ['lunch', 'dinner'] as const) {
              const meal = day[slot];
              const gravy = meal.components.find(c => c.category === 'gravy');
              const dryVeggie = meal.components.find(c => c.category === 'dry_veggie');

              if (gravy && dryVeggie) {
                const gravySig = getSignatureIngredientNames(gravy);
                const drySig = getSignatureIngredientNames(dryVeggie);

                const overlap = [...gravySig].filter(n => drySig.has(n));
                expect(overlap).toEqual([]);
              }
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * For any generated meal, gravy and dry_veggie should not have
   * cross-group protein conflicts (e.g. chicken gravy + fish dry_veggie).
   *
   * Uses a mixed pool with both protein and veg components to exercise
   * the protein conflict prevention logic.
   */
  it('(c) no cross-group protein conflicts within a meal', () => {
    fc.assert(
      fc.property(
        fc.record({
          gravy: fc.integer({ min: 8, max: 12 }),
          dry_veggie: fc.integer({ min: 8, max: 12 }),
        }),
        (poolSizes) => {
          const { gravies, dryVeggies } = buildMixedProteinPool(
            poolSizes.gravy, poolSizes.dry_veggie, 'pc',
          );
          const components: MealComponent[] = [
            ...buildCategoryPool('base', 8, 'pc'),
            ...gravies,
            ...dryVeggies,
            ...buildCategoryPool('side', 4, 'pc'),
          ];

          const plan = generateWeeklyPlan(
            breakfasts, components,
            { cuisine: 'north_indian', diet: 'non_veg', style: 'health' },
          );

          for (const day of plan) {
            for (const slot of ['lunch', 'dinner'] as const) {
              const meal = day[slot];
              const gravy = meal.components.find(c => c.category === 'gravy');
              const dryVeggie = meal.components.find(c => c.category === 'dry_veggie');

              if (gravy && dryVeggie) {
                const conflict = hasProteinConflict(gravy, dryVeggie);
                if (conflict) {
                  const gGroups = [...getProteinGroups(gravy)].join(', ');
                  const dGroups = [...getProteinGroups(dryVeggie)].join(', ');
                  throw new Error(
                    `${day.day} ${slot}: protein conflict between ` +
                    `gravy "${gravy.name}" (groups: ${gGroups}) and ` +
                    `dry_veggie "${dryVeggie.name}" (groups: ${dGroups})`,
                  );
                }
              }
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.5, 3.6**
   *
   * Plans generate successfully without errors for various pool sizes
   * (3–15 per category). This verifies progressive relaxation and
   * graceful handling of small pools continue to work after the fix.
   */
  it('(d) plans generate successfully without errors for various pool sizes', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: 3, max: 15 }),
          gravy: fc.integer({ min: 3, max: 15 }),
          dry_veggie: fc.integer({ min: 3, max: 15 }),
          side: fc.integer({ min: 3, max: 15 }),
        }),
        (poolSizes) => {
          const components: MealComponent[] = [
            ...buildCategoryPool('base', poolSizes.base, 'ps'),
            ...buildCategoryPool('gravy', poolSizes.gravy, 'ps'),
            ...buildCategoryPool('dry_veggie', poolSizes.dry_veggie, 'ps'),
            ...buildCategoryPool('side', poolSizes.side, 'ps'),
          ];

          // Should not throw for any valid pool size >= 3
          const plan = generateWeeklyPlan(breakfasts, components, preferences);

          // Plan must have 7 days
          expect(plan).toHaveLength(7);

          // Each day must have breakfast, lunch, and dinner
          for (const day of plan) {
            expect(day.breakfast).toBeDefined();
            expect(day.lunch).toBeDefined();
            expect(day.dinner).toBeDefined();

            // Lunch and dinner must have exactly 4 components
            expect(day.lunch.components).toHaveLength(4);
            expect(day.dinner.components).toHaveLength(4);

            // Each composed meal must have one component per category
            for (const slot of ['lunch', 'dinner'] as const) {
              const categories = day[slot].components.map(c => c.category).sort();
              expect(categories).toEqual(['base', 'dry_veggie', 'gravy', 'side']);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
