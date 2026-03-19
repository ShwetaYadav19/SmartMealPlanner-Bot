import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { composeMeal, ComposeMealConstraints } from '../../src/core/planGenerator';
import type { MealComponent, Ingredient, ComponentCategory } from '../../src/core/types';

// ============================================================
// Property 2: Preservation — Non-Dual-Protein Behavior Unchanged
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
//
// PRESERVATION TESTS: Expected to PASS on UNFIXED code.
// These confirm baseline behavior for non-dual-protein pools
// so we can verify no regressions after the fix.
// ============================================================

/**
 * Protein keywords matching the design spec's PROTEIN_KEYWORDS list.
 */
const PROTEIN_KEYWORDS = ['chicken', 'chicken mince', 'fish', 'prawns', 'eggs', 'paneer', 'tofu'];

function isProteinDish(component: MealComponent): boolean {
  for (const ing of component.ingredients) {
    const name = ing.name.toLowerCase();
    for (const keyword of PROTEIN_KEYWORDS) {
      if (name.includes(keyword)) return true;
    }
  }
  return false;
}

// ── Component factories ─────────────────────────────────────────

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
    style: 'regular',
    slots: ['lunch', 'dinner'],
    ingredients,
    ...overrides,
  };
}

// ── Veg gravies (no protein ingredients) ────────────────────────

const sambar = makeComponent('si-gravy-001', 'Sambar', 'gravy',
  [makeIngredient('Toor Dal', 'lentils'), makeIngredient('Drumstick'), makeIngredient('Tamarind', 'spices')],
  { cuisine: ['south_indian', 'north_indian'] },
);

const dalTadka = makeComponent('ni-gravy-001', 'Dal Tadka', 'gravy',
  [makeIngredient('Toor Dal', 'lentils'), makeIngredient('Cumin Seeds', 'spices')],
);

const moongDal = makeComponent('ni-gravy-002', 'Moong Dal', 'gravy',
  [makeIngredient('Moong Dal', 'lentils'), makeIngredient('Ghee', 'dairy')],
);

const rajma = makeComponent('ni-gravy-003', 'Rajma', 'gravy',
  [makeIngredient('Kidney Beans', 'lentils'), makeIngredient('Onion'), makeIngredient('Tomato')],
);

// ── Veg dry_veggies (no protein ingredients) ────────────────────

const beansPoriyal = makeComponent('si-dry_veggie-001', 'Beans Poriyal', 'dry_veggie',
  [makeIngredient('Green Beans'), makeIngredient('Coconut', 'spices')],
  { cuisine: ['south_indian', 'north_indian'] },
);

const aluGobi = makeComponent('ni-dry_veggie-001', 'Aloo Gobi', 'dry_veggie',
  [makeIngredient('Potato'), makeIngredient('Cauliflower')],
);

const carrotPoriyal = makeComponent('si-dry_veggie-002', 'Carrot Poriyal', 'dry_veggie',
  [makeIngredient('Carrot'), makeIngredient('Coconut', 'spices')],
  { cuisine: ['south_indian', 'north_indian'] },
);

const bhindi = makeComponent('ni-dry_veggie-002', 'Bhindi Masala', 'dry_veggie',
  [makeIngredient('Okra'), makeIngredient('Onion')],
);

// ── Single-protein gravies (for protein+veg tests) ─────────────

const fishCurry = makeComponent('si-gravy-010', 'Fish Curry', 'gravy',
  [makeIngredient('Fish', 'protein'), makeIngredient('Coconut Milk', 'dairy'), makeIngredient('Curry Leaves', 'spices')],
  { diet: 'non_veg', cuisine: ['south_indian', 'north_indian'] },
);

const eggCurry = makeComponent('ni-gravy-011', 'Egg Curry', 'gravy',
  [makeIngredient('Eggs', 'protein'), makeIngredient('Onion'), makeIngredient('Tomato')],
  { diet: 'non_veg' },
);

// ── Single-protein dry_veggies (for veg+protein tests) ──────────

const chickenFry = makeComponent('ni-dry_veggie-010', 'Chicken Pepper Fry', 'dry_veggie',
  [makeIngredient('Chicken', 'protein'), makeIngredient('Black Pepper', 'spices'), makeIngredient('Curry Leaves', 'spices')],
  { diet: 'non_veg' },
);

const prawnFry = makeComponent('si-dry_veggie-011', 'Prawn Fry', 'dry_veggie',
  [makeIngredient('Prawns', 'protein'), makeIngredient('Chilli Powder', 'spices')],
  { diet: 'non_veg', cuisine: ['south_indian', 'north_indian'] },
);

// ── Bases ───────────────────────────────────────────────────────

const roti = makeComponent('ni-base-002', 'Roti', 'base',
  [makeIngredient('Whole Wheat Flour', 'grains')],
  { style: 'health' },
);

const steamedRice = makeComponent('si-base-001', 'Steamed Rice', 'base',
  [makeIngredient('Rice', 'grains')],
  { cuisine: ['south_indian', 'north_indian'], style: 'health' },
);

// ── Sides ───────────────────────────────────────────────────────

const curd = makeComponent('si-side-001', 'Curd', 'side',
  [makeIngredient('Yogurt', 'dairy')],
  { cuisine: ['south_indian', 'north_indian'], style: 'health' },
);

const pickle = makeComponent('si-side-003', 'Pickle', 'side',
  [makeIngredient('Mango Pickle', 'condiments')],
  { cuisine: ['south_indian', 'north_indian'] },
);

// ── Helpers ─────────────────────────────────────────────────────

function emptyConstraints(): ComposeMealConstraints {
  return {
    base:       { recentIds: new Set(), sameDayIds: new Set() },
    gravy:      { recentIds: new Set(), sameDayIds: new Set() },
    dry_veggie: { recentIds: new Set(), sameDayIds: new Set() },
    side:       { recentIds: new Set(), sameDayIds: new Set() },
  };
}

// ── fast-check arbitraries for non-dual-protein pools ───────────

const vegGravies = [sambar, dalTadka, moongDal, rajma];
const vegDryVeggies = [beansPoriyal, aluGobi, carrotPoriyal, bhindi];
const proteinGravies = [fishCurry, eggCurry];
const proteinDryVeggies = [chickenFry, prawnFry];
const bases = [roti, steamedRice];
const sides = [curd, pickle];

/**
 * Arbitrary: pick a non-empty subset from an array.
 */
function nonEmptySubset<T>(items: T[]): fc.Arbitrary<T[]> {
  return fc.subarray(items, { minLength: 1, maxLength: items.length });
}


describe('Property 2: Preservation — Non-Dual-Protein Behavior Unchanged', () => {

  /**
   * **Validates: Requirements 3.1, 3.5**
   *
   * For all veg-only component pools (no protein ingredients in any gravy
   * or dry_veggie), composeMeal produces a valid meal with all four
   * categories (base, gravy, dry_veggie, side) and no component is
   * rejected by the protein balance rule.
   *
   * This confirms pure-veg users are completely unaffected by the fix.
   */
  it('veg-only pools compose valid meals with all four categories', () => {
    fc.assert(
      fc.property(
        nonEmptySubset(vegGravies),
        nonEmptySubset(vegDryVeggies),
        nonEmptySubset(bases),
        nonEmptySubset(sides),
        (gravyPool, dryVeggiePool, basePool, sidePool) => {
          const components = [...basePool, ...gravyPool, ...dryVeggiePool, ...sidePool];

          const meal = composeMeal(
            components,
            'lunch',
            'north_indian',
            emptyConstraints(),
          );

          // Must have exactly 4 components, one per category
          expect(meal.components).toHaveLength(4);
          const categories = meal.components.map(c => c.category).sort();
          expect(categories).toEqual(['base', 'dry_veggie', 'gravy', 'side']);

          // All components must be veg (no protein dishes)
          const gravy = meal.components.find(c => c.category === 'gravy')!;
          const dryVeggie = meal.components.find(c => c.category === 'dry_veggie')!;
          expect(isProteinDish(gravy)).toBe(false);
          expect(isProteinDish(dryVeggie)).toBe(false);

          // Name and ingredients must be populated
          expect(meal.name.length).toBeGreaterThan(0);
          expect(meal.ingredients.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * For all component pools where at most one of gravy/dry_veggie candidates
   * contains protein ingredients, composeMeal produces a valid meal with all
   * four categories. This covers:
   *  - protein gravy + veg dry_veggie (Req 3.2)
   *  - veg gravy + protein dry_veggie (Req 3.3)
   *
   * Single-protein pools should compose balanced meals normally.
   */
  it('single-protein pools compose valid meals with all four categories', () => {
    // Arbitrary: either protein gravies + veg dry_veggies, or veg gravies + protein dry_veggies
    const singleProteinPool = fc.oneof(
      // Case A: protein gravy + veg dry_veggie
      fc.tuple(
        nonEmptySubset(proteinGravies),
        nonEmptySubset(vegDryVeggies),
      ).map(([pg, vd]) => ({ gravyPool: pg, dryVeggiePool: vd, label: 'protein_gravy+veg_dry' })),
      // Case B: veg gravy + protein dry_veggie
      fc.tuple(
        nonEmptySubset(vegGravies),
        nonEmptySubset(proteinDryVeggies),
      ).map(([vg, pd]) => ({ gravyPool: vg, dryVeggiePool: pd, label: 'veg_gravy+protein_dry' })),
    );

    fc.assert(
      fc.property(
        singleProteinPool,
        nonEmptySubset(bases),
        nonEmptySubset(sides),
        ({ gravyPool, dryVeggiePool }, basePool, sidePool) => {
          const components = [...basePool, ...gravyPool, ...dryVeggiePool, ...sidePool];

          const meal = composeMeal(
            components,
            'lunch',
            'north_indian',
            emptyConstraints(),
          );

          // Must have exactly 4 components, one per category
          expect(meal.components).toHaveLength(4);
          const categories = meal.components.map(c => c.category).sort();
          expect(categories).toEqual(['base', 'dry_veggie', 'gravy', 'side']);

          // The gravy must come from the gravy pool
          const gravy = meal.components.find(c => c.category === 'gravy')!;
          expect(gravyPool.some(g => g.id === gravy.id)).toBe(true);

          // The dry_veggie must come from the dry_veggie pool
          const dryVeggie = meal.components.find(c => c.category === 'dry_veggie')!;
          expect(dryVeggiePool.some(d => d.id === dryVeggie.id)).toBe(true);

          // Name and ingredients must be populated
          expect(meal.name.length).toBeGreaterThan(0);
          expect(meal.ingredients.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * Ingredient overlap avoidance, sliding window, and same-day dedup
   * constraints continue to function for non-dual-protein pools.
   * When constraints are applied, the pool is not empty and composeMeal
   * still produces a valid meal.
   */
  it('constraints (sliding window, same-day dedup, ingredient overlap) still function', () => {
    // Use a pool with enough variety to exercise constraints
    const fullComponents = [
      ...bases, ...vegGravies, ...vegDryVeggies, ...sides,
    ];

    fc.assert(
      fc.property(
        // Pick 0-2 gravy IDs for the sliding window
        fc.subarray(vegGravies.map(g => g.id), { minLength: 0, maxLength: 2 }),
        // Pick 0-2 dry_veggie IDs for the sliding window
        fc.subarray(vegDryVeggies.map(d => d.id), { minLength: 0, maxLength: 2 }),
        // Pick 0-1 gravy IDs for same-day dedup
        fc.subarray(vegGravies.map(g => g.id), { minLength: 0, maxLength: 1 }),
        // Pick 0-1 dry_veggie IDs for same-day dedup
        fc.subarray(vegDryVeggies.map(d => d.id), { minLength: 0, maxLength: 1 }),
        (recentGravyIds, recentDryIds, sameDayGravyIds, sameDayDryIds) => {
          const constraints: ComposeMealConstraints = {
            base:       { recentIds: new Set(), sameDayIds: new Set() },
            gravy:      { recentIds: new Set(recentGravyIds), sameDayIds: new Set(sameDayGravyIds) },
            dry_veggie: { recentIds: new Set(recentDryIds), sameDayIds: new Set(sameDayDryIds) },
            side:       { recentIds: new Set(), sameDayIds: new Set() },
          };

          const meal = composeMeal(
            fullComponents,
            'lunch',
            'north_indian',
            constraints,
          );

          // Must still produce a valid meal with all four categories
          expect(meal.components).toHaveLength(4);
          const categories = meal.components.map(c => c.category).sort();
          expect(categories).toEqual(['base', 'dry_veggie', 'gravy', 'side']);

          const gravy = meal.components.find(c => c.category === 'gravy')!;
          const dryVeggie = meal.components.find(c => c.category === 'dry_veggie')!;

          // When same-day dedup IDs are set and alternatives exist,
          // the selected component should not be in the same-day set
          if (sameDayGravyIds.length > 0 && vegGravies.length > sameDayGravyIds.length) {
            expect(sameDayGravyIds).not.toContain(gravy.id);
          }
          if (sameDayDryIds.length > 0 && vegDryVeggies.length > sameDayDryIds.length) {
            expect(sameDayDryIds).not.toContain(dryVeggie.id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
