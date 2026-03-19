import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { JsonMealRepository } from '../../src/adapters/jsonMealRepository';

const mealsPath = path.resolve(__dirname, '../../data/meals.json');

describe('JsonMealRepository', () => {
  const repo = new JsonMealRepository(mealsPath);

  it('loads all meals from the JSON file', async () => {
    const all = await repo.getMeals({});
    expect(all.length).toBeGreaterThan(0);
  });

  it('filters by cuisine north_indian', async () => {
    const meals = await repo.getMeals({ cuisine: 'north_indian' });
    expect(meals.length).toBeGreaterThan(0);
    meals.forEach((m) => expect(m.cuisine).toContain('north_indian'));
  });

  it('filters by cuisine south_indian', async () => {
    const meals = await repo.getMeals({ cuisine: 'south_indian' });
    expect(meals.length).toBeGreaterThan(0);
    meals.forEach((m) => expect(m.cuisine).toContain('south_indian'));
  });

  it('returns only north_indian-tagged items when cuisine filter is "both"', async () => {
    const meals = await repo.getMeals({ cuisine: 'both' });
    expect(meals.length).toBeGreaterThan(0);
    for (const m of meals) {
      expect(m.cuisine).toContain('north_indian');
    }
    // No south_indian-only items
    const southOnly = meals.filter((m) => !m.cuisine.includes('north_indian'));
    expect(southOnly.length).toBe(0);
  });

  it('filters by diet', async () => {
    const veg = await repo.getMeals({ diet: 'veg' });
    veg.forEach((m) => expect(m.diet).toBe('veg'));

    const nonVeg = await repo.getMeals({ diet: 'non_veg' });
    nonVeg.forEach((m) => expect(m.diet).toBe('non_veg'));
  });

  it('filters by style', async () => {
    const health = await repo.getMeals({ style: 'health' });
    health.forEach((m) => expect(m.style).toBe('health'));

    const regular = await repo.getMeals({ style: 'regular' });
    regular.forEach((m) => expect(m.style).toBe('regular'));
  });

  it('filters by slot', async () => {
    const breakfast = await repo.getMeals({ slot: 'breakfast' });
    breakfast.forEach((m) => expect(m.slots).toContain('breakfast'));

    const lunch = await repo.getMeals({ slot: 'lunch' });
    lunch.forEach((m) => expect(m.slots).toContain('lunch'));

    const dinner = await repo.getMeals({ slot: 'dinner' });
    dinner.forEach((m) => expect(m.slots).toContain('dinner'));
  });

  it('applies multiple filters together', async () => {
    const meals = await repo.getMeals({
      cuisine: 'north_indian',
      diet: 'veg',
      style: 'health',
      slot: 'breakfast',
    });
    meals.forEach((m) => {
      expect(m.cuisine).toContain('north_indian');
      expect(m.diet).toBe('veg');
      expect(m.style).toBe('health');
      expect(m.slots).toContain('breakfast');
    });
  });

  it('getMealById returns the correct meal', async () => {
    const meal = await repo.getMealById('ni-b-001');
    expect(meal).not.toBeNull();
    expect(meal!.name).toBe('Poha');
  });

  it('getMealById returns null for unknown id', async () => {
    const meal = await repo.getMealById('nonexistent-id');
    expect(meal).toBeNull();
  });
});
