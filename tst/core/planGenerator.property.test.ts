import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateWeeklyPlan } from '../../src/core/planGenerator';
import type { Meal, Ingredient } from '../../src/core/types';

// --- Arbitraries ---

const cuisineArb = fc.constantFrom('north_indian' as const, 'south_indian' as const);
const dietArb = fc.constantFrom('veg' as const, 'non_veg' as const, 'both' as const);
const styleArb = fc.constantFrom('health' as const, 'regular' as const);
const slotArb = fc.constantFrom('breakfast' as const, 'lunch' as const, 'dinner' as const);

const ingredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  quantity: fc.string({ minLength: 1, maxLength: 10 }),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'nuts', 'protein'),
});

/**
 * Build a meal arbitrary that matches the given preferences and is compatible
 * with the specified slot.
 */
function mealArb(
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
  slot: 'breakfast' | 'lunch' | 'dinner',
  idPrefix: string,
): fc.Arbitrary<Meal> {
  return fc.record({
    id: fc.constant(`${idPrefix}`),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    cuisine: fc.constant(cuisine),
    diet: fc.constant(diet),
    style: fc.constant(style),
    slots: fc.constant([slot] as ('breakfast' | 'lunch' | 'dinner')[]),
    ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 3 }),
  });
}

/**
 * Generate a pool of meals that match the given preferences with enough
 * unique meals per slot (at least 8 per slot) so generateWeeklyPlan can work.
 */
function mealPoolArb(
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
): fc.Arbitrary<Meal[]> {
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  const perSlot = 8; // need at least 7 unique per slot

  const arbs = slots.flatMap((slot) =>
    Array.from({ length: perSlot }, (_, i) =>
      mealArb(cuisine, diet, style, slot, `${cuisine.slice(0, 2)}-${slot[0]}-${String(i).padStart(3, '0')}`),
    ),
  );

  return fc.tuple(...(arbs as [fc.Arbitrary<Meal>, ...fc.Arbitrary<Meal>[]])).map((meals) => meals);
}

/**
 * For "both" cuisine, generate a pool with meals from both north_indian and
 * south_indian, ensuring enough per slot from each cuisine.
 */
function bothCuisineMealPoolArb(
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
): fc.Arbitrary<Meal[]> {
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  const perSlotPerCuisine = 5; // 5 north + 5 south = 10 per slot, plenty for 7 days
  const cuisines = ['north_indian', 'south_indian'] as const;

  const arbs = cuisines.flatMap((cuisine) =>
    slots.flatMap((slot) =>
      Array.from({ length: perSlotPerCuisine }, (_, i) =>
        mealArb(
          cuisine,
          diet,
          style,
          slot,
          `${cuisine.slice(0, 2)}-${slot[0]}-${String(i).padStart(3, '0')}`,
        ),
      ),
    ),
  );

  return fc.tuple(...(arbs as [fc.Arbitrary<Meal>, ...fc.Arbitrary<Meal>[]])).map((meals) => meals);
}

// --- Preference arbitrary for single-cuisine tests ---
const singleCuisinePrefsArb = fc.record({
  cuisine: cuisineArb,
  diet: fc.constantFrom('veg' as const, 'non_veg' as const),
  style: styleArb,
});

// --- Preference arbitrary for "both" cuisine tests ---
const bothCuisinePrefsArb = fc.record({
  cuisine: fc.constant('both' as const),
  diet: fc.constantFrom('veg' as const, 'non_veg' as const),
  style: styleArb,
});

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ============================================================
// Property 4: Weekly plan structural invariants
// Validates: Requirements 4.1, 4.3, 4.4, 4.5
// ============================================================

describe('Property 4: Weekly plan structural invariants', () => {
  /**
   * **Validates: Requirements 4.1, 4.4, 4.5**
   *
   * For any valid meal pool and preferences, the generated plan:
   * - Has exactly 7 days (Monday–Sunday)
   * - Each day has exactly 3 meals (breakfast, lunch, dinner)
   * - No meal repeats within the same day across slots
   * - No meal repeats in the same slot on consecutive days
   */
  it('plan has 7 days, 3 meals each, no same-day repeats, no consecutive-day same-slot repeats', () => {
    fc.assert(
      fc.property(singleCuisinePrefsArb, (prefs) => {
        // Build a matching meal pool inside the property body so it uses the same prefs
        const meals = buildMealPool(prefs.cuisine, prefs.diet, prefs.style);
        const plan = generateWeeklyPlan(meals, prefs);

        // Exactly 7 days
        expect(plan).toHaveLength(7);

        // Days are Monday–Sunday in order
        plan.forEach((day, i) => {
          expect(day.day).toBe(DAYS[i]);
        });

        for (let d = 0; d < plan.length; d++) {
          const day = plan[d];

          // Each day has 3 distinct meal slots
          expect(day.breakfast).toBeDefined();
          expect(day.lunch).toBeDefined();
          expect(day.dinner).toBeDefined();

          // No same-day repeats: all 3 meal IDs are distinct
          const ids = [day.breakfast.id, day.lunch.id, day.dinner.id];
          expect(new Set(ids).size).toBe(3);

          // No consecutive-day same-slot repeats
          if (d > 0) {
            const prev = plan[d - 1];
            expect(day.breakfast.id).not.toBe(prev.breakfast.id);
            expect(day.lunch.id).not.toBe(prev.lunch.id);
            expect(day.dinner.id).not.toBe(prev.dinner.id);
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// Property 5: Plan meals match user preferences
// Validates: Requirements 4.3
// ============================================================

describe('Property 5: Plan meals match user preferences', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * Every meal in the generated plan matches the user's diet, style,
   * and cuisine preferences.
   */
  it('every meal matches diet, style, and cuisine preferences (single diet)', () => {
    const singleDietPrefsArb = fc.record({
      cuisine: cuisineArb,
      diet: fc.constantFrom('veg' as const, 'non_veg' as const),
      style: styleArb,
    });
    fc.assert(
      fc.property(singleDietPrefsArb, (prefs) => {
        const meals = buildMealPool(prefs.cuisine, prefs.diet, prefs.style);
        const plan = generateWeeklyPlan(meals, prefs);

        for (const day of plan) {
          for (const meal of [day.breakfast, day.lunch, day.dinner]) {
            expect(meal.diet).toBe(prefs.diet);
            expect(meal.style).toBe(prefs.style);
            expect(meal.cuisine).toBe(prefs.cuisine);
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// Property 6: "Both" cuisine distribution
// Validates: Requirements 4.6
// ============================================================

describe('Property 6: "Both" cuisine distribution', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * When cuisine preference is "both", the plan contains at least one
   * North Indian meal and at least one South Indian meal.
   */
  it('plan contains at least one North Indian and one South Indian meal when preference is "both"', () => {
    fc.assert(
      fc.property(bothCuisinePrefsArb, (prefs) => {
        const meals = buildBothCuisineMealPool(prefs.diet, prefs.style);
        const plan = generateWeeklyPlan(meals, prefs);

        const allMeals = plan.flatMap((d) => [d.breakfast, d.lunch, d.dinner]);
        const cuisines = new Set(allMeals.map((m) => m.cuisine));

        expect(cuisines.has('north_indian')).toBe(true);
        expect(cuisines.has('south_indian')).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// Property 7: "Both" diet distribution
// Validates: diet='both' produces mix of veg and non-veg
// ============================================================

describe('Property 7: "Both" diet distribution', () => {
  /**
   * When diet preference is "both", the plan contains at least one
   * veg meal and at least one non-veg meal, with at most one non-veg
   * slot per day.
   */
  it('plan contains both veg and non-veg meals with max 1 non-veg per day', () => {
    const bothDietPrefsArb = fc.record({
      cuisine: fc.constantFrom('north_indian' as const, 'south_indian' as const),
      diet: fc.constant('both' as const),
      style: styleArb,
    });

    fc.assert(
      fc.property(bothDietPrefsArb, (prefs) => {
        const meals = buildBothDietMealPool(prefs.cuisine, prefs.style);
        const plan = generateWeeklyPlan(meals, prefs);

        const allMeals = plan.flatMap((d) => [d.breakfast, d.lunch, d.dinner]);
        const diets = new Set(allMeals.map((m) => m.diet));

        // Should have both veg and non-veg
        expect(diets.has('veg')).toBe(true);
        expect(diets.has('non_veg')).toBe(true);

        // At most 1 non-veg meal per day
        for (const day of plan) {
          const nonVegCount = [day.breakfast, day.lunch, day.dinner]
            .filter(m => m.diet === 'non_veg').length;
          expect(nonVegCount).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 50 },
    );
  });
});

// --- Helper functions to build deterministic meal pools ---

function buildMealPool(
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
): Meal[] {
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  const perSlot = 8;
  const meals: Meal[] = [];

  for (const slot of slots) {
    for (let i = 0; i < perSlot; i++) {
      meals.push({
        id: `${cuisine.slice(0, 2)}-${slot[0]}-${String(i).padStart(3, '0')}`,
        name: `${cuisine} ${slot} ${i}`,
        cuisine,
        diet,
        style,
        slots: [slot],
        ingredients: [{ name: `Ingredient ${i}`, quantity: '100g', category: 'vegetables' }],
      });
    }
  }

  return meals;
}

function buildBothCuisineMealPool(
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
): Meal[] {
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  const cuisines = ['north_indian', 'south_indian'] as const;
  const perSlotPerCuisine = 5;
  const meals: Meal[] = [];

  for (const cuisine of cuisines) {
    for (const slot of slots) {
      for (let i = 0; i < perSlotPerCuisine; i++) {
        meals.push({
          id: `${cuisine.slice(0, 2)}-${slot[0]}-${String(i).padStart(3, '0')}`,
          name: `${cuisine} ${slot} ${i}`,
          cuisine,
          diet,
          style,
          slots: [slot],
          ingredients: [{ name: `Ingredient ${cuisine} ${i}`, quantity: '100g', category: 'vegetables' }],
        });
      }
    }
  }

  return meals;
}

function buildBothDietMealPool(
  cuisine: 'north_indian' | 'south_indian',
  style: 'health' | 'regular',
): Meal[] {
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  const diets = ['veg', 'non_veg'] as const;
  const perSlotPerDiet = 5;
  const meals: Meal[] = [];

  for (const diet of diets) {
    for (const slot of slots) {
      for (let i = 0; i < perSlotPerDiet; i++) {
        meals.push({
          id: `${diet.slice(0, 1)}-${slot[0]}-${String(i).padStart(3, '0')}`,
          name: `${diet} ${cuisine} ${slot} ${i}`,
          cuisine,
          diet,
          style,
          slots: [slot],
          ingredients: [{ name: `Ingredient ${diet} ${i}`, quantity: '100g', category: 'vegetables' }],
        });
      }
    }
  }

  return meals;
}
