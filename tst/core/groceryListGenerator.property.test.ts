import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateGroceryList } from '../../src/core/groceryListGenerator';
import type { Meal, Ingredient } from '../../src/core/types';

// --- Arbitraries ---

const ingredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  quantity: fc.string({ minLength: 1, maxLength: 10 }),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'nuts', 'protein'),
});

const mealArb: fc.Arbitrary<Meal> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 15 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  cuisine: fc.constantFrom('north_indian' as const, 'south_indian' as const),
  diet: fc.constantFrom('veg' as const, 'non_veg' as const),
  style: fc.constantFrom('health' as const, 'regular' as const),
  slots: fc.subarray(['breakfast' as const, 'lunch' as const, 'dinner' as const], { minLength: 1 }),
  ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 5 }),
});

const mealsArb = fc.array(mealArb, { minLength: 1, maxLength: 10 });

// ============================================================
// Property 7: Grocery list ingredient completeness
// Validates: Requirements 5.1, 7.1
// ============================================================

describe('Property 7: Grocery list ingredient completeness', () => {
  /**
   * **Validates: Requirements 5.1, 7.1**
   *
   * For any set of meals, every unique ingredient name (case-insensitive)
   * from the input appears in the output grocery list.
   */
  it('every ingredient from every input meal appears in the output grocery list', () => {
    fc.assert(
      fc.property(mealsArb, (meals) => {
        const groceryList = generateGroceryList(meals);
        const outputNames = new Set(groceryList.map((item) => item.name.toLowerCase()));

        // Collect all unique ingredient names from input (case-insensitive)
        const inputNames = new Set<string>();
        for (const meal of meals) {
          for (const ingredient of meal.ingredients) {
            inputNames.add(ingredient.name.toLowerCase());
          }
        }

        // Every input ingredient name must appear in the output
        for (const name of inputNames) {
          expect(outputNames.has(name)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
