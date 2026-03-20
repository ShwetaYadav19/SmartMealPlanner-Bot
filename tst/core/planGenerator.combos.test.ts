import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { generateWeeklyPlan } from '../../src/core/planGenerator';
import { JsonMealRepository } from '../../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../../src/adapters/jsonMealComponentRepository';
import type { Meal, MealComponent, ComposedMeal, DayPlan } from '../../src/core/types';

/**
 * Guardrail tests: every cuisine × diet × style combination must produce
 * a valid 7-day plan without throwing.
 *
 * These tests use the real data files so they catch data gaps
 * (missing categories, insufficient variety, etc.) at CI time.
 */

const mealRepo = new JsonMealRepository(
  path.resolve(__dirname, '../../data/meals.json'),
);
const componentRepo = new JsonMealComponentRepository(
  path.resolve(__dirname, '../../data/meal-components'),
);

const CUISINES = ['north_indian', 'south_indian', 'both'] as const;
const DIETS = ['veg', 'non_veg', 'both'] as const;
const STYLES = ['health', 'regular'] as const;

type Cuisine = (typeof CUISINES)[number];
type Diet = (typeof DIETS)[number];
type Style = (typeof STYLES)[number];

async function fetchMeals(cuisine: Cuisine, diet: Diet, style: Style): Promise<Meal[]> {
  return mealRepo.getMeals({
    cuisine: cuisine as any,
    diet: diet as any,
    style,
  });
}

async function fetchComponents(cuisine: Cuisine, style: Style): Promise<MealComponent[]> {
  // Components are fetched without diet filter (bases/sides are always veg)
  return componentRepo.getComponents({
    cuisine: cuisine as any,
    style,
  });
}

function isComposedMeal(meal: unknown): meal is ComposedMeal {
  return (
    typeof meal === 'object' &&
    meal !== null &&
    'components' in meal &&
    Array.isArray((meal as ComposedMeal).components)
  );
}

describe('Plan generation: all 18 cuisine × diet × style combos', () => {
  for (const cuisine of CUISINES) {
    for (const diet of DIETS) {
      for (const style of STYLES) {
        const label = `${cuisine}/${diet}/${style}`;

        it(`${label} — generates a 7-day plan without errors`, async () => {
          const meals = await fetchMeals(cuisine, diet, style);
          const components = await fetchComponents(cuisine, style);
          const prefs = { cuisine, diet, style };

          const plan = generateWeeklyPlan(meals, components, prefs);

          expect(plan).toHaveLength(7);
        });

        it(`${label} — every day has breakfast, composed lunch, composed dinner`, async () => {
          const meals = await fetchMeals(cuisine, diet, style);
          const components = await fetchComponents(cuisine, style);
          const plan = generateWeeklyPlan(meals, components, { cuisine, diet, style });

          for (const day of plan) {
            expect(day.breakfast).toBeDefined();
            expect(day.breakfast.name).toBeTruthy();

            expect(isComposedMeal(day.lunch)).toBe(true);
            expect(day.lunch.components).toHaveLength(4);

            expect(isComposedMeal(day.dinner)).toBe(true);
            expect(day.dinner.components).toHaveLength(4);
          }
        });

        it(`${label} — lunch/dinner each have one base, gravy, dry_veggie, side`, async () => {
          const meals = await fetchMeals(cuisine, diet, style);
          const components = await fetchComponents(cuisine, style);
          const plan = generateWeeklyPlan(meals, components, { cuisine, diet, style });

          const requiredCategories = ['base', 'gravy', 'dry_veggie', 'side'];

          for (const day of plan) {
            for (const slot of [day.lunch, day.dinner]) {
              const categories = slot.components.map((c) => c.category);
              for (const cat of requiredCategories) {
                expect(categories).toContain(cat);
              }
            }
          }
        });

        it(`${label} — at least 3 unique breakfasts across the week`, async () => {
          const meals = await fetchMeals(cuisine, diet, style);
          const components = await fetchComponents(cuisine, style);
          const plan = generateWeeklyPlan(meals, components, { cuisine, diet, style });

          const uniqueBreakfasts = new Set(plan.map((d) => d.breakfast.id));
          expect(uniqueBreakfasts.size).toBeGreaterThanOrEqual(3);
        });

        it(`${label} — no component repeats within the same day across lunch and dinner`, async () => {
          const meals = await fetchMeals(cuisine, diet, style);
          const components = await fetchComponents(cuisine, style);
          const plan = generateWeeklyPlan(meals, components, { cuisine, diet, style });

          for (const day of plan) {
            // Same-day dedup applies to base, gravy, and dry_veggie
            // Sides (small pool) may repeat
            const dedupCategories = ['base', 'gravy', 'dry_veggie'];
            const lunchIds = day.lunch.components
              .filter((c) => dedupCategories.includes(c.category))
              .map((c) => c.id);
            const dinnerIds = day.dinner.components
              .filter((c) => dedupCategories.includes(c.category))
              .map((c) => c.id);
            const overlap = lunchIds.filter((id) => dinnerIds.includes(id));
            expect(overlap).toEqual([]);
          }
        });

        if (diet === 'non_veg') {
          it(`${label} — plan includes non-veg gravies`, async () => {
            const meals = await fetchMeals(cuisine, diet, style);
            const components = await fetchComponents(cuisine, style);
            const plan = generateWeeklyPlan(meals, components, { cuisine, diet, style });

            const gravyDiets = new Set<string>();
            for (const day of plan) {
              for (const comp of day.lunch.components) {
                if (comp.category === 'gravy') gravyDiets.add(comp.diet);
              }
              for (const comp of day.dinner.components) {
                if (comp.category === 'gravy') gravyDiets.add(comp.diet);
              }
            }
            expect(gravyDiets.has('non_veg')).toBe(true);
          });
        }
      }
    }
  }
});
