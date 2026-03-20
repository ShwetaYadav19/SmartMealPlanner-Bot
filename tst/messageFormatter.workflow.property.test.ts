import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatBotResponse } from '../src/messageFormatter';
import type { Meal, MealComponent, ComposedMeal, Ingredient, DayPlan, WeeklyPlan } from '../src/core/types';
import { ResponseType } from '../src/core/types';

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
    cuisine: fc.array(cuisineArb, { minLength: 1, maxLength: 2 }),
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
    cuisine: fc.array(cuisineArb, { minLength: 1, maxLength: 2 }),
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
      name: components.map((c) => c.name).join(', '),
      ingredients: components.flatMap((c) => c.ingredients),
    };
  });
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dayPlanArb(day: string, index: number): fc.Arbitrary<DayPlan> {
  return fc.record({
    day: fc.constant(day),
    breakfast: mealArb(`wp-${index}-b`),
    lunch: composedMealArb(`wp-${index}-l`),
    dinner: composedMealArb(`wp-${index}-d`),
  });
}

const weeklyPlanArb: fc.Arbitrary<WeeklyPlan> = fc.tuple(
  ...DAYS.map((day, i) => dayPlanArb(day, i)),
).map((days) => days as DayPlan[]);

// --- Property Test ---

describe('(Feature: smart-meal-planner-workflow, Property 6: Plan display contains all meal names)', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any WeeklyPlan, the formatted output from formatBotResponse (with type WEEKLY_PLAN)
   * should contain the name field of every breakfast, lunch, and dinner in the plan.
   */
  it('formatBotResponse with WEEKLY_PLAN contains every meal name from the plan', () => {
    fc.assert(
      fc.property(weeklyPlanArb, (plan) => {
        const formatted = formatBotResponse({
          type: ResponseType.WEEKLY_PLAN,
          data: { weeklyPlan: plan },
        });

        for (const dayPlan of plan) {
          expect(formatted.text).toContain(dayPlan.breakfast.name);
          expect(formatted.text).toContain(dayPlan.lunch.name);
          expect(formatted.text).toContain(dayPlan.dinner.name);
        }
      }),
      { numRuns: 100 },
    );
  });
});
