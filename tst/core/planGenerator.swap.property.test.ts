import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { swapTomorrowLunch } from '../../src/core/planGenerator';
import type { Meal, MealComponent, ComposedMeal, DayPlan, WeeklyPlan } from '../../src/core/types';

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

function buildComponent(
  id: string,
  name: string,
  category: 'base' | 'gravy' | 'dry_veggie' | 'side',
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
): MealComponent {
  return {
    id,
    name,
    category,
    cuisine,
    diet,
    style,
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: `Ingredient for ${name}`, quantity: '100g', category: 'vegetables' }],
  };
}

function buildComposedMeal(
  prefix: string,
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
  gravyId: string,
): ComposedMeal {
  const base = buildComponent(`${prefix}-base`, `${prefix} Base`, 'base', cuisine, diet, style);
  const gravy = buildComponent(gravyId, `${prefix} Gravy`, 'gravy', cuisine, diet, style);
  const dry = buildComponent(`${prefix}-dry`, `${prefix} Dry`, 'dry_veggie', cuisine, diet, style);
  const side = buildComponent(`${prefix}-side`, `${prefix} Side`, 'side', cuisine, diet, style);
  const components = [base, gravy, dry, side];
  return {
    components,
    name: components.map(c => c.name).join(', '),
    ingredients: components.flatMap(c => c.ingredients),
  };
}

/**
 * Build a component pool with enough unique components per category.
 */
function buildComponentPool(
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
  perCategory: number,
): MealComponent[] {
  const categories = ['base', 'gravy', 'dry_veggie', 'side'] as const;
  const components: MealComponent[] = [];
  for (const cat of categories) {
    for (let i = 0; i < perCategory; i++) {
      components.push(
        buildComponent(
          `${cuisine.slice(0, 2)}-${cat[0]}-${String(i).padStart(3, '0')}`,
          `${cuisine} ${cat} ${i}`,
          cat,
          cuisine,
          diet,
          style,
        ),
      );
    }
  }
  return components;
}

/**
 * Build a valid weekly plan with ComposedMeal lunch/dinner.
 */
function buildWeeklyPlan(
  cuisine: 'north_indian' | 'south_indian',
  diet: 'veg' | 'non_veg',
  style: 'health' | 'regular',
): WeeklyPlan {
  return DAYS.map((day, i) => ({
    day,
    breakfast: buildMeal(`b-${i}`, `Breakfast ${i}`, cuisine, diet, style, ['breakfast']),
    lunch: buildComposedMeal(`l-${i}`, cuisine, diet, style, `lunch-gravy-${i}`),
    dinner: buildComposedMeal(`d-${i}`, cuisine, diet, style, `dinner-gravy-${i}`),
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
   * 2. The new lunch is a valid ComposedMeal with 4 components
   * 3. The new lunch gravy differs from the original lunch gravy
   */
  it('replacement is a valid ComposedMeal with different gravy from original', () => {
    fc.assert(
      fc.property(prefsArb, tomorrowIndexArb, (prefs, tomorrowIndex) => {
        const pool = buildComponentPool(prefs.cuisine, prefs.diet, prefs.style, 15);
        const plan = buildWeeklyPlan(prefs.cuisine, prefs.diet, prefs.style);

        const result = swapTomorrowLunch(plan, tomorrowIndex, pool, prefs);

        // If null, no valid replacement exists — that's acceptable
        if (result === null) {
          return;
        }

        const { updatedPlan, oldMeal, newMeal } = result;

        // 1. The new lunch name is different from the old lunch name
        expect(newMeal).not.toBe(oldMeal);

        const swappedDay = updatedPlan[tomorrowIndex];
        const newLunch = swappedDay.lunch;

        // 2. The new lunch is a valid ComposedMeal with 4 components
        expect(newLunch.components).toHaveLength(4);
        const categories = newLunch.components.map(c => c.category);
        expect(categories).toContain('base');
        expect(categories).toContain('gravy');
        expect(categories).toContain('dry_veggie');
        expect(categories).toContain('side');

        // 3. The new lunch gravy differs from the original
        const originalGravyId = plan[tomorrowIndex].lunch.components.find(c => c.category === 'gravy')?.id;
        const newGravyId = newLunch.components.find(c => c.category === 'gravy')?.id;
        expect(newGravyId).not.toBe(originalGravyId);
      }),
      { numRuns: 100 },
    );
  });
});
