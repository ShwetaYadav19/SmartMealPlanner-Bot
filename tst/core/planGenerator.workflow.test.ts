import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { generateAlternatives, regenerateWeeklyPlan, generateWeeklyPlan } from '../../src/core/planGenerator';
import { JsonMealRepository } from '../../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../../src/adapters/jsonMealComponentRepository';
import type { Meal, MealComponent, WeeklyPlan, ComposedMeal } from '../../src/core/types';

const mealRepo = new JsonMealRepository(
  path.resolve(__dirname, '../../data/meals.json'),
);
const componentRepo = new JsonMealComponentRepository(
  path.resolve(__dirname, '../../data/meal-components'),
);

const defaultPrefs = { cuisine: 'north_indian', diet: 'veg', style: 'health' };

let cachedMeals: Meal[] | null = null;
let cachedComponents: MealComponent[] | null = null;
let cachedPlan: WeeklyPlan | null = null;

async function getMeals(): Promise<Meal[]> {
  if (!cachedMeals) {
    cachedMeals = await mealRepo.getMeals({ cuisine: 'north_indian', diet: 'veg', style: 'health' });
  }
  return cachedMeals;
}

async function getComponents(): Promise<MealComponent[]> {
  if (!cachedComponents) {
    cachedComponents = await componentRepo.getComponents({ cuisine: 'north_indian', style: 'health' });
  }
  return cachedComponents;
}

async function getPlan(): Promise<WeeklyPlan> {
  if (!cachedPlan) {
    const meals = await getMeals();
    const components = await getComponents();
    cachedPlan = generateWeeklyPlan(meals, components, defaultPrefs);
  }
  return cachedPlan;
}

function isComposedMeal(meal: unknown): meal is ComposedMeal {
  return (
    typeof meal === 'object' &&
    meal !== null &&
    'components' in meal &&
    Array.isArray((meal as ComposedMeal).components)
  );
}

describe('generateAlternatives', () => {
  it('returns up to 3 breakfast alternatives excluding the current breakfast', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const alts = generateAlternatives(plan, 0, 'breakfast', meals, components, defaultPrefs, 3);

    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(3);
    const currentId = plan[0].breakfast.id;
    for (const alt of alts) {
      expect((alt as Meal).id).not.toBe(currentId);
    }
  });

  it('returns Meal objects for breakfast alternatives', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const alts = generateAlternatives(plan, 0, 'breakfast', meals, components, defaultPrefs, 3);

    for (const alt of alts) {
      expect('slots' in alt).toBe(true);
      expect((alt as Meal).slots).toContain('breakfast');
    }
  });

  it('returns ComposedMeal objects for lunch alternatives', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const alts = generateAlternatives(plan, 0, 'lunch', meals, components, defaultPrefs, 3);

    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect(isComposedMeal(alt)).toBe(true);
      expect((alt as ComposedMeal).components).toHaveLength(4);
    }
  });

  it('returns ComposedMeal objects for dinner alternatives', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const alts = generateAlternatives(plan, 2, 'dinner', meals, components, defaultPrefs, 3);

    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect(isComposedMeal(alt)).toBe(true);
      expect((alt as ComposedMeal).components).toHaveLength(4);
    }
  });

  it('lunch alternatives differ from the current lunch (different gravy)', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const currentGravyId = plan[0].lunch.components.find(c => c.category === 'gravy')?.id;
    const alts = generateAlternatives(plan, 0, 'lunch', meals, components, defaultPrefs, 3);

    for (const alt of alts) {
      const altGravyId = (alt as ComposedMeal).components.find(c => c.category === 'gravy')?.id;
      expect(altGravyId).not.toBe(currentGravyId);
    }
  });

  it('returns empty array for invalid dayIndex', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    expect(generateAlternatives(plan, -1, 'breakfast', meals, components, defaultPrefs, 3)).toEqual([]);
    expect(generateAlternatives(plan, 7, 'lunch', meals, components, defaultPrefs, 3)).toEqual([]);
  });

  it('works for all 7 days', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    for (let d = 0; d < 7; d++) {
      const alts = generateAlternatives(plan, d, 'lunch', meals, components, defaultPrefs, 3);
      expect(alts.length).toBeGreaterThan(0);
    }
  });
});

describe('regenerateWeeklyPlan', () => {
  it('returns a valid 7-day plan', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const newPlan = regenerateWeeklyPlan(plan, meals, components, defaultPrefs);

    expect(newPlan).toHaveLength(7);
    for (const day of newPlan) {
      expect(day.breakfast).toBeDefined();
      expect(day.lunch.components).toHaveLength(4);
      expect(day.dinner.components).toHaveLength(4);
    }
  });

  it('new plan differs from the original (at least some meals change)', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const newPlan = regenerateWeeklyPlan(plan, meals, components, defaultPrefs);

    // Collect all IDs from both plans
    const originalIds = new Set<string>();
    const newIds = new Set<string>();
    for (const day of plan) {
      originalIds.add(day.breakfast.id);
      for (const c of day.lunch.components) originalIds.add(c.id);
      for (const c of day.dinner.components) originalIds.add(c.id);
    }
    for (const day of newPlan) {
      newIds.add(day.breakfast.id);
      for (const c of day.lunch.components) newIds.add(c.id);
      for (const c of day.dinner.components) newIds.add(c.id);
    }

    // At least some IDs should differ
    const overlap = [...newIds].filter(id => originalIds.has(id));
    expect(overlap.length).toBeLessThan(originalIds.size);
  });

  it('preserves the same plan structure (days Monday-Sunday)', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const newPlan = regenerateWeeklyPlan(plan, meals, components, defaultPrefs);

    const expectedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    expect(newPlan.map(d => d.day)).toEqual(expectedDays);
  });

  it('each day has proper composed meals with base, gravy, dry_veggie, side', async () => {
    const meals = await getMeals();
    const components = await getComponents();
    const plan = await getPlan();

    const newPlan = regenerateWeeklyPlan(plan, meals, components, defaultPrefs);

    const requiredCategories = ['base', 'gravy', 'dry_veggie', 'side'];
    for (const day of newPlan) {
      for (const slot of [day.lunch, day.dinner]) {
        const categories = slot.components.map(c => c.category);
        for (const cat of requiredCategories) {
          expect(categories).toContain(cat);
        }
      }
    }
  });

  it('works with different preference combinations', async () => {
    const allMeals = await mealRepo.getMeals({});
    const allComponents = await componentRepo.getComponents({});

    const combos = [
      { cuisine: 'north_indian', diet: 'veg', style: 'health' },
      { cuisine: 'north_indian', diet: 'veg', style: 'regular' },
      { cuisine: 'south_indian', diet: 'veg', style: 'health' },
    ];

    for (const prefs of combos) {
      const plan = generateWeeklyPlan(allMeals, allComponents, prefs);
      const newPlan = regenerateWeeklyPlan(plan, allMeals, allComponents, prefs);
      expect(newPlan).toHaveLength(7);
    }
  });
});
