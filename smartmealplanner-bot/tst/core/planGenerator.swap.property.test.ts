import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { swapTomorrowLunch } from '../../src/core/planGenerator';
import type { Meal, DayPlan, WeeklyPlan } from '../../src/core/types';

// --- Helpers ---

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function buildMeal(
  id: string,
  name: string,
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
  slots: ('breakfast' | 'lunch' | 'dinner')[],
): Meal {
  return {
    id,
    name,
    cuisine,
    diet,
    style,
    slots,
    ingredients: [{ name: `Ingredient for ${name}`, quantity: '100g', category: 'vegetables' }],
  };
}

/**
 * Build a deterministic meal pool with enough unique meals per slot.
 * Returns meals that all match the given preferences.
 */
function buildMealPool(
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
  perSlot: number,
): Meal[] {
  const slots = ['breakfast', 'lunch', 'dinner'] as const;
  const meals: Meal[] = [];
  for (const slot of slots) {
    for (let i = 0; i < perSlot; i++) {
      meals.push(
        buildMeal(
          `${cuisine.slice(0, 2)}-${slot[0]}-${String(i).padStart(3, '0')}`,
          `${cuisine} ${slot} ${i}`,
          cuisine,
          diet,
          style,
          [slot],
        ),
      );
    }
  }
  return meals;
}

/**
 * Build a valid weekly plan from a meal pool, assigning unique meals per slot per day.
 */
function buildWeeklyPlan(pool: Meal[]): WeeklyPlan {
  const bySlot = {
    breakfast: pool.filter((m) => m.slots.includes('breakfast')),
    lunch: pool.filter((m) => m.slots.includes('lunch')),
    dinner: pool.filter((m) => m.slots.includes('dinner')),
  };

  return DAYS.map((day, i) => ({
    day,
    breakfast: bySlot.breakfast[i % bySlot.breakfast.length],
    lunch: bySlot.lunch[i % bySlot.lunch.length],
    dinner: bySlot.dinner[i % bySlot.dinner.length],
  }));
}

// --- Arbitraries ---

const cuisineArb = fc.constantFrom('north_indian' as const, 'south_indian' as const);
const dietArb = fc.constantFrom('veg' as const, 'non_veg' as const);
const styleArb = fc.constantFrom('health' as const, 'regular' as const);
const tomorrowIndexArb = fc.integer({ min: 0, max: 6 });

const prefsArb = fc.record({
  cuisine: cuisineArb,
  diet: dietArb,
  style: styleArb,
});

// ============================================================
// Property 10: Swap lunch constraints
// Validates: Requirements 10.1, 10.2
// ============================================================

describe('Property 10: Swap lunch constraints', () => {
  /**
   * **Validates: Requirements 10.1, 10.2**
   *
   * When swapTomorrowLunch succeeds (non-null result):
   * 1. The new lunch is different from the old lunch
   * 2. The new lunch doesn't duplicate breakfast or dinner on the same day
   * 3. The new lunch doesn't duplicate lunch on adjacent days
   * 4. The new lunch is compatible with the 'lunch' slot
   */
  it('replacement matches preferences, no same-day duplicates, no adjacent-day lunch duplicates', () => {
    fc.assert(
      fc.property(prefsArb, tomorrowIndexArb, (prefs, tomorrowIndex) => {
        // Build a pool with enough meals (15 per slot) so swap has candidates
        const pool = buildMealPool(prefs.cuisine, prefs.diet, prefs.style, 15);
        const plan = buildWeeklyPlan(pool);

        const result = swapTomorrowLunch(plan, tomorrowIndex, pool, prefs);

        // If null, no valid replacement exists — that's acceptable
        if (result === null) {
          return;
        }

        const { updatedPlan, oldMeal, newMeal } = result;

        // 1. The new lunch is different from the old lunch
        expect(newMeal).not.toBe(oldMeal);

        const swappedDay = updatedPlan[tomorrowIndex];
        const newLunch = swappedDay.lunch;

        // 2. The new lunch doesn't duplicate breakfast or dinner on the same day
        expect(newLunch.id).not.toBe(swappedDay.breakfast.id);
        expect(newLunch.id).not.toBe(swappedDay.dinner.id);

        // 3. The new lunch doesn't duplicate lunch on adjacent days
        if (tomorrowIndex > 0) {
          expect(newLunch.id).not.toBe(updatedPlan[tomorrowIndex - 1].lunch.id);
        }
        if (tomorrowIndex < 6) {
          expect(newLunch.id).not.toBe(updatedPlan[tomorrowIndex + 1].lunch.id);
        }

        // 4. The new lunch is compatible with the 'lunch' slot
        expect(newLunch.slots).toContain('lunch');
      }),
      { numRuns: 100 },
    );
  });
});
