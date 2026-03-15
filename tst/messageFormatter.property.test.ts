import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatWeeklyPlan, formatDayPlan, formatGroceryList, formatCookMessage } from '../src/messageFormatter';
import type { Meal, MealComponent, ComposedMeal, Ingredient, DayPlan, WeeklyPlan, GroceryItem } from '../src/core/types';

// --- Arbitraries ---

const cuisineArb = fc.constantFrom('north_indian' as const, 'south_indian' as const);
const dietArb = fc.constantFrom('veg' as const, 'non_veg' as const);
const styleArb = fc.constantFrom('health' as const, 'regular' as const);
const slotArb = fc.constantFrom('breakfast' as const, 'lunch' as const, 'dinner' as const);

const ingredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  quantity: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'nuts', 'protein'),
});

const mealNameArb = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,28}[A-Za-z0-9]$/)
  .filter((s) => s.length >= 2);

function mealArb(idPrefix: string): fc.Arbitrary<Meal> {
  return fc.record({
    id: fc.constant(idPrefix),
    name: mealNameArb,
    cuisine: cuisineArb,
    diet: dietArb,
    style: styleArb,
    slots: fc.array(slotArb, { minLength: 1, maxLength: 3 }),
    ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 5 }),
  });
}

const componentNameArb = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,18}[A-Za-z0-9]$/)
  .filter((s) => s.length >= 2);

function componentArb(
  idPrefix: string,
  category: 'base' | 'gravy' | 'dry_veggie' | 'side',
): fc.Arbitrary<MealComponent> {
  return fc.record({
    id: fc.constant(`${idPrefix}-${category}`),
    name: componentNameArb,
    category: fc.constant(category),
    cuisine: cuisineArb,
    diet: dietArb,
    style: styleArb,
    slots: fc.constant(['lunch', 'dinner'] as ('lunch' | 'dinner')[]),
    ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 3 }),
  });
}

function composedMealArb(idPrefix: string): fc.Arbitrary<ComposedMeal> {
  return fc.tuple(
    componentArb(idPrefix, 'base'),
    componentArb(idPrefix, 'gravy'),
    componentArb(idPrefix, 'dry_veggie'),
    componentArb(idPrefix, 'side'),
  ).map(([base, gravy, dry, side]) => {
    const components = [base, gravy, dry, side];
    return {
      components,
      name: components.map(c => c.name).join(', '),
      ingredients: components.flatMap(c => c.ingredients),
    };
  });
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dayPlanArb(day: string, index: number): fc.Arbitrary<DayPlan> {
  return fc.record({
    day: fc.constant(day),
    breakfast: mealArb(`bp-${index}-b`),
    lunch: composedMealArb(`bp-${index}-l`),
    dinner: composedMealArb(`bp-${index}-d`),
  });
}

const weeklyPlanArb: fc.Arbitrary<WeeklyPlan> = fc.tuple(
  ...DAYS.map((day, i) => dayPlanArb(day, i)),
).map((days) => days as DayPlan[]);

const singleDayPlanArb: fc.Arbitrary<DayPlan> = fc.constantFrom(...DAYS).chain((day) =>
  dayPlanArb(day, 0),
);

const groceryItemArb: fc.Arbitrary<GroceryItem> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  quantity: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'nuts', 'protein'),
});

const groceryListArb: fc.Arbitrary<GroceryItem[]> = fc.array(groceryItemArb, {
  minLength: 1,
  maxLength: 20,
});


// ============================================================
// Property 15: Formatted messages contain expected content
// Validates: Requirements 4.8, 5.2, 6.2, 7.2, 9.2, 16.1
// ============================================================

describe('Property 15: Formatted messages contain expected content', () => {
  /**
   * **Validates: Requirements 4.8, 16.1**
   *
   * Weekly plan output contains all 7 day names and all 21 meal names.
   */
  it('formatWeeklyPlan output contains all 7 day names and all 21 meal names', () => {
    fc.assert(
      fc.property(weeklyPlanArb, (plan) => {
        const output = formatWeeklyPlan(plan);

        // All 7 day names present
        for (const day of DAYS) {
          expect(output).toContain(day);
        }

        // All 21 meal names present (7 days × 3 meals)
        for (const day of plan) {
          expect(output).toContain(day.breakfast.name);
          expect(output).toContain(day.lunch.name);
          expect(output).toContain(day.dinner.name);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 16.1**
   *
   * Day plan output contains all 3 meal names for that day.
   */
  it('formatDayPlan output contains all 3 meal names', () => {
    fc.assert(
      fc.property(singleDayPlanArb, (day) => {
        const output = formatDayPlan(day);

        expect(output).toContain(day.breakfast.name);
        expect(output).toContain(day.lunch.name);
        expect(output).toContain(day.dinner.name);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2, 7.2, 16.1**
   *
   * Grocery list output contains all ingredient names.
   */
  it('formatGroceryList output contains all ingredient names', () => {
    fc.assert(
      fc.property(groceryListArb, (items) => {
        const output = formatGroceryList(items);

        for (const item of items) {
          expect(output).toContain(item.name);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.2, 16.1**
   *
   * Cook message output contains the day name and all 3 meal names.
   */
  it('formatCookMessage output contains day name and all 3 meal names', () => {
    fc.assert(
      fc.property(singleDayPlanArb, (day) => {
        const output = formatCookMessage(day);

        expect(output).toContain(day.day);
        expect(output).toContain(day.breakfast.name);
        expect(output).toContain(day.lunch.name);
        expect(output).toContain(day.dinner.name);
      }),
      { numRuns: 100 },
    );
  });
});
