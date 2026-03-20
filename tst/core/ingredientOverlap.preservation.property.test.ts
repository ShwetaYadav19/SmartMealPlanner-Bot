import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getSignatureIngredientNames } from '../../src/core/planGenerator';
import type { MealComponent, Ingredient } from '../../src/core/types';

// ============================================================
// Property 2: Preservation — True Overlap Still Detected
// **Validates: Requirements 3.1, 3.2**
//
// PRESERVATION TEST: Expected to PASS on both unfixed and fixed code.
// Components sharing at least one signature ingredient (protein,
// lentils, vegetables) must always have overlapping signature sets,
// proving hasIngredientOverlap correctly detects true overlap.
// ============================================================

/** Signature ingredient categories that define a dish's identity. */
const SIGNATURE_CATEGORIES = ['protein', 'lentils', 'vegetables'] as const;

/** Pantry-staple categories (ignored for overlap). */
const PANTRY_CATEGORIES = ['spices', 'dairy', 'oils', 'grains', 'nuts', 'condiments', 'fruits'] as const;

// ── Arbitraries ─────────────────────────────────────────────

/** Pool of realistic signature ingredient names. */
const SIGNATURE_NAMES = [
  'Cauliflower', 'Potato', 'Okra', 'Spinach', 'Drumstick',
  'Brinjal', 'Green Beans', 'Cabbage', 'Carrot', 'Ivy Gourd',
  'Toor Dal', 'Masoor Dal', 'Moong Dal', 'Kidney Beans', 'Chana Dal',
  'Chicken', 'Fish', 'Prawns', 'Eggs', 'Paneer',
];

/** Generate a signature ingredient with a specific name. */
function signatureIngredient(name: string): fc.Arbitrary<Ingredient> {
  return fc.record({
    name: fc.constant(name),
    quantity: fc.constant('200g'),
    category: fc.constantFrom(...SIGNATURE_CATEGORIES),
  });
}

/** Generate a unique signature ingredient (not matching the shared one). */
function uniqueSignatureIngredientArb(excludeName: string): fc.Arbitrary<Ingredient> {
  const available = SIGNATURE_NAMES.filter(n => n.toLowerCase() !== excludeName.toLowerCase());
  return fc.record({
    name: fc.constantFrom(...available),
    quantity: fc.constant('200g'),
    category: fc.constantFrom(...SIGNATURE_CATEGORIES),
  });
}

/** Generate a pantry-staple ingredient. */
const pantryIngredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.constantFrom(
    'Onion', 'Cumin Seeds', 'Turmeric Powder', 'Oil', 'Ghee',
    'Tomato Paste', 'Ginger-Garlic Paste', 'Mustard Seeds',
    'Curry Leaves', 'Salt', 'Black Pepper', 'Coriander Powder',
  ),
  quantity: fc.constant('1 tsp'),
  category: fc.constantFrom(...PANTRY_CATEGORIES),
});

describe('Property 2: Preservation — True Overlap Still Detected', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any pair of MealComponents where both share at least one
   * signature ingredient (same name, category in protein/lentils/vegetables),
   * getSignatureIngredientNames must return sets with a non-empty
   * intersection — proving hasIngredientOverlap would return true
   * for the name-based check.
   *
   * This must pass on BOTH unfixed and fixed code, since true
   * signature overlap was always detected correctly.
   */
  it('components sharing a signature ingredient have overlapping signature sets', () => {
    fc.assert(
      fc.property(
        // Pick a shared signature ingredient name
        fc.constantFrom(...SIGNATURE_NAMES),
        // Optional extra unique signature ingredients for each component
        fc.array(uniqueSignatureIngredientArb('__placeholder__'), { minLength: 0, maxLength: 2 }),
        fc.array(uniqueSignatureIngredientArb('__placeholder__'), { minLength: 0, maxLength: 2 }),
        // Optional pantry ingredients for each component
        fc.array(pantryIngredientArb, { minLength: 0, maxLength: 3 }),
        fc.array(pantryIngredientArb, { minLength: 0, maxLength: 3 }),
        (sharedName, extraSigA, extraSigB, pantryA, pantryB) => {
          // Build the shared signature ingredient with a valid signature category
          const sharedIngredient: Ingredient = {
            name: sharedName,
            quantity: '200g',
            category: 'vegetables', // any signature category works
          };

          const componentA: MealComponent = {
            id: 'comp-a',
            name: 'Component A',
            category: 'gravy',
            cuisine: ['north_indian'],
            diet: 'veg',
            style: 'regular',
            slots: ['lunch', 'dinner'],
            ingredients: [sharedIngredient, ...extraSigA, ...pantryA],
          };

          const componentB: MealComponent = {
            id: 'comp-b',
            name: 'Component B',
            category: 'dry_veggie',
            cuisine: ['north_indian'],
            diet: 'veg',
            style: 'regular',
            slots: ['lunch', 'dinner'],
            ingredients: [sharedIngredient, ...extraSigB, ...pantryB],
          };

          // The property: signature sets must have a non-empty intersection
          const sigSetA = getSignatureIngredientNames(componentA);
          const sigSetB = getSignatureIngredientNames(componentB);

          // The shared ingredient must appear in both signature sets
          expect(sigSetA.has(sharedName.toLowerCase())).toBe(true);
          expect(sigSetB.has(sharedName.toLowerCase())).toBe(true);

          // Verify non-empty intersection exists
          const intersection = [...sigSetA].filter(n => sigSetB.has(n));
          expect(intersection.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
