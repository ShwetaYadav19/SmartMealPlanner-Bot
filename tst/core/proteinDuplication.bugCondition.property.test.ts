import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { composeMeal, ComposeMealConstraints } from '../../src/core/planGenerator';
import type { MealComponent, Ingredient, ComponentCategory } from '../../src/core/types';

// ============================================================
// Property 1: Bug Condition — Dual-Protein Meal Pairing
// **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
//
// EXPLORATION TEST: Expected to FAIL on unfixed code.
// Failure confirms the bug exists — composeMeal pairs two protein
// dishes when veg alternatives are available.
// ============================================================

/**
 * Protein keywords matching the design spec's PROTEIN_KEYWORDS list.
 * Used inline to classify components as protein dishes.
 */
const PROTEIN_KEYWORDS = ['chicken', 'chicken mince', 'fish', 'prawns', 'eggs', 'paneer', 'tofu'];

/**
 * Check if a component is a protein dish by scanning its ingredients
 * against PROTEIN_KEYWORDS (case-insensitive substring match).
 */
function isProteinDish(component: MealComponent): boolean {
  for (const ing of component.ingredients) {
    const name = ing.name.toLowerCase();
    for (const keyword of PROTEIN_KEYWORDS) {
      if (name.includes(keyword)) return true;
    }
  }
  return false;
}

// ── Test component factories ────────────────────────────────────

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

// ── Protein gravies (paneer/tofu — NOT in current PROTEIN_GROUPS) ──
// Ingredients are chosen to avoid overlap with protein dry_veggies below.

const tofuCurry = makeComponent('ni-gravy-015', 'Tofu Curry', 'gravy',
  [makeIngredient('Tofu', 'protein'), makeIngredient('Tomato'), makeIngredient('Ginger-Garlic Paste', 'spices')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

const shahiPaneer = makeComponent('ni-gravy-009', 'Shahi Paneer', 'gravy',
  [makeIngredient('Paneer', 'dairy'), makeIngredient('Cream', 'dairy'), makeIngredient('Cashews', 'nuts')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

const kadaiPaneer = makeComponent('ni-gravy-016', 'Kadhai Paneer', 'gravy',
  [makeIngredient('Paneer', 'dairy'), makeIngredient('Capsicum'), makeIngredient('Coriander', 'spices')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

// ── Protein dry_veggies (paneer/tofu — NOT in current PROTEIN_GROUPS) ──
// Ingredients chosen to avoid overlap with protein gravies above.

const paneerBhurji = makeComponent('ni-dry_veggie-016', 'Paneer Bhurji', 'dry_veggie',
  [makeIngredient('Paneer', 'dairy'), makeIngredient('Green Chilli'), makeIngredient('Turmeric Powder', 'spices')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

const tofuBhurji = makeComponent('ni-dry_veggie-017', 'Tofu Bhurji', 'dry_veggie',
  [makeIngredient('Tofu', 'protein'), makeIngredient('Green Chilli'), makeIngredient('Turmeric Powder', 'spices')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

const chillyPaneer = makeComponent('ni-dry_veggie-018', 'Chilly Paneer', 'dry_veggie',
  [makeIngredient('Paneer', 'dairy'), makeIngredient('Soy Sauce', 'condiments'), makeIngredient('Vinegar', 'condiments')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

// ── Veg alternatives ────────────────────────────────────────────

const dalTadka = makeComponent('ni-gravy-001', 'Dal Tadka', 'gravy',
  [makeIngredient('Toor Dal', 'lentils'), makeIngredient('Cumin Seeds', 'spices')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

const aluGobi = makeComponent('ni-dry_veggie-001', 'Aloo Gobi', 'dry_veggie',
  [makeIngredient('Potato'), makeIngredient('Cauliflower')],
  { diet: 'veg', cuisine: ['north_indian'] },
);

// ── Base and side (always veg) ──────────────────────────────────

const roti = makeComponent('ni-base-002', 'Roti', 'base',
  [makeIngredient('Whole Wheat Flour', 'grains')],
  { diet: 'veg', cuisine: ['north_indian'], style: 'health' },
);

const steamedRice = makeComponent('si-base-001', 'Steamed Rice', 'base',
  [makeIngredient('Rice', 'grains')],
  { diet: 'veg', cuisine: ['south_indian', 'north_indian'], style: 'health' },
);

const curd = makeComponent('si-side-001', 'Curd', 'side',
  [makeIngredient('Yogurt', 'dairy')],
  { diet: 'veg', cuisine: ['south_indian', 'north_indian'], style: 'health' },
);

const pickle = makeComponent('si-side-003', 'Pickle', 'side',
  [makeIngredient('Mango Pickle', 'condiments')],
  { diet: 'veg', cuisine: ['south_indian', 'north_indian'] },
);

// ── Empty constraints helper ────────────────────────────────────

function emptyConstraints(): ComposeMealConstraints {
  return {
    base:       { recentIds: new Set(), sameDayIds: new Set() },
    gravy:      { recentIds: new Set(), sameDayIds: new Set() },
    dry_veggie: { recentIds: new Set(), sameDayIds: new Set() },
    side:       { recentIds: new Set(), sameDayIds: new Set() },
  };
}


describe('Property 1: Bug Condition — No Dual-Protein Meals', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
   *
   * For any composed meal where both the gravy and dry_veggie are protein dishes
   * AND at least one non-protein alternative exists in the candidate pool for
   * either slot, composeMeal SHALL select a non-protein alternative for one of
   * the slots, ensuring the meal has at most one protein component.
   *
   * This test constructs pools with protein gravies (paneer/tofu — not in
   * current PROTEIN_GROUPS), protein dry_veggies, AND veg alternatives.
   * The protein options outnumber veg options 3:1 to ensure the bug is
   * reliably triggered by random shuffling.
   *
   * EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
   */
  it('composeMeal should not pair two protein dishes when veg alternatives exist', () => {
    // The pool has 3 protein gravies + 1 veg gravy, and 3 protein dry_veggies + 1 veg dry_veggie.
    // All use north_indian cuisine with no ingredient overlap between gravy and dry_veggie
    // protein options (so ingredient overlap won't accidentally prevent the pairing).
    //
    // On unfixed code: paneer/tofu are not in PROTEIN_GROUPS, so hasProteinConflict
    // returns false, and pickComponent happily pairs two protein dishes.
    const components: MealComponent[] = [
      // Bases
      roti, steamedRice,
      // Gravies: 3 protein (paneer/tofu) + 1 veg
      tofuCurry, shahiPaneer, kadaiPaneer, dalTadka,
      // Dry veggies: 3 protein (paneer/tofu) + 1 veg
      paneerBhurji, tofuBhurji, chillyPaneer, aluGobi,
      // Sides
      curd, pickle,
    ];

    // Run composeMeal many times. Due to random shuffling, if the bug exists,
    // at least some runs will produce dual-protein meals.
    // We use fc.property with a dummy integer to get many independent runs.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        (_iteration) => {
          const meal = composeMeal(
            components,
            'lunch',
            'north_indian',
            emptyConstraints(),
          );

          const gravy = meal.components.find(c => c.category === 'gravy');
          const dryVeggie = meal.components.find(c => c.category === 'dry_veggie');

          expect(gravy).toBeDefined();
          expect(dryVeggie).toBeDefined();

          const gravyIsProtein = isProteinDish(gravy!);
          const dryVeggieIsProtein = isProteinDish(dryVeggie!);

          // The property: at most one of gravy/dry_veggie should be a protein dish
          // when veg alternatives exist in the pool
          if (gravyIsProtein && dryVeggieIsProtein) {
            throw new Error(
              `Dual-protein meal detected: ` +
              `gravy="${gravy!.name}" + dry_veggie="${dryVeggie!.name}". ` +
              `Veg alternatives were available: gravy=[Dal Tadka], dry_veggie=[Aloo Gobi]`,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
