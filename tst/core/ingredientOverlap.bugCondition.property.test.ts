import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getSignatureIngredientNames } from '../../src/core/planGenerator';
import type { MealComponent, Ingredient, ComponentCategory } from '../../src/core/types';

// ============================================================
// Property 1: Bug Condition — Signature-Only Overlap Detection
// **Validates: Requirements 2.1, 2.2, 2.3**
//
// EXPLORATION TEST: Expected to FAIL on unfixed code.
// Failure confirms the bug — hasIngredientOverlap would return
// true (false positive) for component pairs sharing only pantry
// staples, because the old code compared ALL ingredient names.
//
// On FIXED code this test should PASS, because
// getSignatureIngredientNames filters to signature categories
// only, so pantry-staple-only overlap produces disjoint sets.
// ============================================================

/** Pantry-staple ingredient categories (should be ignored for overlap). */
const PANTRY_CATEGORIES = ['spices', 'dairy', 'oils', 'grains', 'nuts', 'condiments', 'fruits'] as const;

/** Signature ingredient categories (define a dish's identity). */
const SIGNATURE_CATEGORIES = ['protein', 'lentils', 'vegetables'] as const;

// ── Arbitraries ─────────────────────────────────────────────

/** Generate a pantry-staple ingredient with a name from a shared pool. */
const pantryIngredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.constantFrom(
    'Onion', 'Cumin Seeds', 'Turmeric Powder', 'Oil', 'Ghee',
    'Tomato Paste', 'Ginger-Garlic Paste', 'Mustard Seeds',
    'Curry Leaves', 'Salt', 'Black Pepper', 'Coriander Powder',
    'Red Chilli Powder', 'Yogurt', 'Cream', 'Rice Flour',
    'Coconut Oil', 'Cashews', 'Mango Pickle',
  ),
  quantity: fc.constant('1 tsp'),
  category: fc.constantFrom(...PANTRY_CATEGORIES),
});

/** Generate a signature ingredient with a UNIQUE name per component. */
function signatureIngredientArb(prefix: string): fc.Arbitrary<Ingredient> {
  return fc.record({
    name: fc.constantFrom(
      `${prefix}_Cauliflower`, `${prefix}_Potato`, `${prefix}_Okra`,
      `${prefix}_Spinach`, `${prefix}_Drumstick`, `${prefix}_Brinjal`,
      `${prefix}_Beans`, `${prefix}_Cabbage`,
    ),
    quantity: fc.constant('200g'),
    category: fc.constantFrom(...SIGNATURE_CATEGORIES),
  });
}

/** Generate a MealComponent with given ingredients. */
function mealComponentArb(
  idPrefix: string,
  ingredientsArb: fc.Arbitrary<Ingredient[]>,
): fc.Arbitrary<MealComponent> {
  return fc.record({
    id: fc.constant(`${idPrefix}-test`),
    name: fc.constant(`${idPrefix} Component`),
    category: fc.constantFrom('gravy', 'dry_veggie') as fc.Arbitrary<ComponentCategory>,
    cuisine: fc.constant(['north_indian'] as ('north_indian' | 'south_indian')[]),
    diet: fc.constant('veg' as const),
    style: fc.constant('regular' as const),
    slots: fc.constant(['lunch', 'dinner'] as ('lunch' | 'dinner')[]),
    ingredients: ingredientsArb,
  });
}

describe('Property 1: Bug Condition — Signature-Only Overlap Detection', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * For any pair of MealComponents where:
   *   - Both share at least one pantry-staple ingredient name
   *   - Each has its own unique signature ingredients (no shared signature names)
   *
   * The signature ingredient sets (from getSignatureIngredientNames) SHALL be
   * disjoint — proving that hasIngredientOverlap (which now uses
   * getSignatureIngredientNames) would return false for the name check.
   *
   * On UNFIXED code, getComponentIngredientNames was used instead, which
   * included pantry staples, causing false-positive overlap.
   */
  it('components sharing only pantry-staple ingredients have disjoint signature sets', () => {
    // Pick 1-3 shared pantry ingredients that both components will have
    const sharedPantryArb = fc.array(pantryIngredientArb, { minLength: 1, maxLength: 3 });

    // Each component also gets its own unique signature ingredients (prefixed to avoid collision)
    const componentAExtraSignature = fc.array(signatureIngredientArb('A'), { minLength: 1, maxLength: 2 });
    const componentBExtraSignature = fc.array(signatureIngredientArb('B'), { minLength: 1, maxLength: 2 });

    // Each component may also have its own private pantry ingredients
    const privatePantryA = fc.array(pantryIngredientArb, { minLength: 0, maxLength: 2 });
    const privatePantryB = fc.array(pantryIngredientArb, { minLength: 0, maxLength: 2 });

    fc.assert(
      fc.property(
        sharedPantryArb,
        componentAExtraSignature,
        componentBExtraSignature,
        privatePantryA,
        privatePantryB,
        (shared, sigA, sigB, privA, privB) => {
          const ingredientsA = [...shared, ...sigA, ...privA];
          const ingredientsB = [...shared, ...sigB, ...privB];

          const componentA: MealComponent = {
            id: 'comp-a',
            name: 'Component A',
            category: 'gravy',
            cuisine: ['north_indian'],
            diet: 'veg',
            style: 'regular',
            slots: ['lunch', 'dinner'],
            ingredients: ingredientsA,
          };

          const componentB: MealComponent = {
            id: 'comp-b',
            name: 'Component B',
            category: 'dry_veggie',
            cuisine: ['north_indian'],
            diet: 'veg',
            style: 'regular',
            slots: ['lunch', 'dinner'],
            ingredients: ingredientsB,
          };

          // Verify precondition: they share at least one ingredient name
          const allNamesA = new Set(ingredientsA.map(i => i.name.toLowerCase()));
          const allNamesB = new Set(ingredientsB.map(i => i.name.toLowerCase()));
          const hasSharedName = [...allNamesA].some(n => allNamesB.has(n));
          fc.pre(hasSharedName);

          // The property: signature ingredient sets must be disjoint
          const sigSetA = getSignatureIngredientNames(componentA);
          const sigSetB = getSignatureIngredientNames(componentB);

          for (const name of sigSetA) {
            expect(sigSetB.has(name)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
