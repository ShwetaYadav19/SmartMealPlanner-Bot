import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateGroceryList } from '../../src/core/groceryListGenerator';
import type { Meal, ComposedMeal, Ingredient, MealComponent, ComponentCategory } from '../../src/core/types';

// --- Arbitraries ---

const alphanumNameArb = fc.stringMatching(/^[a-z][a-z0-9]{0,14}$/);

const ingredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: alphanumNameArb,
  quantity: fc.stringMatching(/^[0-9]{1,3}[a-z]{1,4}$/),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'nuts', 'protein'),
});

const mealArb: fc.Arbitrary<Meal> = fc.record({
  id: fc.stringMatching(/^m[0-9]{1,6}$/),
  name: fc.stringMatching(/^[a-z]{2,15}$/),
  cuisine: fc.constantFrom<('north_indian' | 'south_indian')[]>(['north_indian'], ['south_indian'], ['north_indian', 'south_indian']),
  diet: fc.constantFrom<'veg' | 'non_veg'>('veg', 'non_veg'),
  style: fc.constantFrom<'health' | 'regular'>('health', 'regular'),
  slots: fc.subarray(['breakfast' as const, 'lunch' as const, 'dinner' as const], { minLength: 1 }),
  ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 5 }),
});

const componentCategoryArb: fc.Arbitrary<ComponentCategory> = fc.constantFrom('base', 'gravy', 'dry_veggie', 'side');

const mealComponentArb: fc.Arbitrary<MealComponent> = fc.record({
  id: fc.stringMatching(/^c[0-9]{1,6}$/),
  name: fc.stringMatching(/^[a-z]{2,15}$/),
  category: componentCategoryArb,
  cuisine: fc.constantFrom<('north_indian' | 'south_indian')[]>(['north_indian'], ['south_indian'], ['north_indian', 'south_indian']),
  diet: fc.constantFrom<'veg' | 'non_veg'>('veg', 'non_veg'),
  style: fc.constantFrom<'health' | 'regular'>('health', 'regular'),
  slots: fc.subarray(['lunch' as const, 'dinner' as const], { minLength: 1 }),
  ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 3 }),
});

const composedMealArb: fc.Arbitrary<ComposedMeal> = fc
  .array(mealComponentArb, { minLength: 1, maxLength: 4 })
  .map((components) => {
    const allIngredients = components.flatMap((c) => c.ingredients);
    return {
      components,
      name: components.map((c) => c.name).join(', '),
      ingredients: allIngredients,
    };
  });

const mixedMealsArb: fc.Arbitrary<(Meal | ComposedMeal)[]> = fc.array(
  fc.oneof(mealArb, composedMealArb),
  { minLength: 1, maxLength: 8 },
);

// ============================================================
// Property 16: Grocery list ingredient completeness
// (Feature: smart-meal-planner-workflow, Property 16: Grocery list ingredient completeness)
// ============================================================

describe('Property 16: Grocery list ingredient completeness (Feature: smart-meal-planner-workflow, Property 16: Grocery list ingredient completeness)', () => {
  /**
   * **Validates: Requirements 9.1, 9.2**
   *
   * For any set of meals (Meal or ComposedMeal), the grocery list generated
   * by generateGroceryList should contain an entry for every unique ingredient
   * name (case-insensitive) present across all input meals.
   */
  it('every unique ingredient name from any mix of Meal and ComposedMeal appears in the grocery list', () => {
    fc.assert(
      fc.property(mixedMealsArb, (meals) => {
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
