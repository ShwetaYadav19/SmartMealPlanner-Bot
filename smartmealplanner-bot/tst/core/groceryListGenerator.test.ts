import { describe, it, expect } from 'vitest';
import { generateGroceryList } from '../../src/core/groceryListGenerator';
import type { Meal } from '../../src/core/types';

function makeMeal(overrides: Partial<Meal> & { name: string; ingredients: Meal['ingredients'] }): Meal {
  return {
    id: 'test-001',
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots: ['lunch'],
    ...overrides,
  };
}

describe('generateGroceryList', () => {
  it('returns an empty list for no meals', () => {
    expect(generateGroceryList([])).toEqual([]);
  });

  it('returns all ingredients from a single meal', () => {
    const meal = makeMeal({
      name: 'Poha',
      ingredients: [
        { name: 'Flattened Rice', quantity: '200g', category: 'grains' },
        { name: 'Onion', quantity: '1 medium', category: 'vegetables' },
      ],
    });

    const result = generateGroceryList([meal]);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.name)).toContain('Flattened Rice');
    expect(result.map((i) => i.name)).toContain('Onion');
  });

  it('deduplicates ingredients by name (case-insensitive)', () => {
    const meal1 = makeMeal({
      name: 'Dish A',
      ingredients: [{ name: 'Onion', quantity: '1 medium', category: 'vegetables' }],
    });
    const meal2 = makeMeal({
      name: 'Dish B',
      id: 'test-002',
      ingredients: [{ name: 'onion', quantity: '2 large', category: 'vegetables' }],
    });

    const result = generateGroceryList([meal1, meal2]);
    const onions = result.filter((i) => i.name.toLowerCase() === 'onion');
    expect(onions).toHaveLength(1);
    // Quantities should be combined
    expect(onions[0].quantity).toContain('1 medium');
    expect(onions[0].quantity).toContain('2 large');
  });

  it('does not duplicate quantity when same quantity appears', () => {
    const meal1 = makeMeal({
      name: 'Dish A',
      ingredients: [{ name: 'Salt', quantity: '1 tsp', category: 'spices' }],
    });
    const meal2 = makeMeal({
      name: 'Dish B',
      id: 'test-002',
      ingredients: [{ name: 'Salt', quantity: '1 tsp', category: 'spices' }],
    });

    const result = generateGroceryList([meal1, meal2]);
    const salt = result.find((i) => i.name === 'Salt');
    expect(salt).toBeDefined();
    expect(salt!.quantity).toBe('1 tsp');
  });

  it('groups output by category', () => {
    const meal = makeMeal({
      name: 'Mixed Dish',
      ingredients: [
        { name: 'Tomato', quantity: '2', category: 'vegetables' },
        { name: 'Cumin', quantity: '1 tsp', category: 'spices' },
        { name: 'Rice', quantity: '1 cup', category: 'grains' },
        { name: 'Milk', quantity: '200ml', category: 'dairy' },
      ],
    });

    const result = generateGroceryList([meal]);
    const categories = result.map((i) => i.category);
    // Should be sorted alphabetically by category
    expect(categories).toEqual(['dairy', 'grains', 'spices', 'vegetables']);
  });

  it('aggregates ingredients across multiple meals', () => {
    const meal1 = makeMeal({
      name: 'Dish A',
      ingredients: [
        { name: 'Tomato', quantity: '2', category: 'vegetables' },
        { name: 'Rice', quantity: '1 cup', category: 'grains' },
      ],
    });
    const meal2 = makeMeal({
      name: 'Dish B',
      id: 'test-002',
      ingredients: [
        { name: 'Paneer', quantity: '200g', category: 'dairy' },
        { name: 'Cumin', quantity: '1 tsp', category: 'spices' },
      ],
    });

    const result = generateGroceryList([meal1, meal2]);
    expect(result).toHaveLength(4);
    const names = result.map((i) => i.name);
    expect(names).toContain('Tomato');
    expect(names).toContain('Rice');
    expect(names).toContain('Paneer');
    expect(names).toContain('Cumin');
  });

  it('handles meals with no ingredients', () => {
    const meal = makeMeal({ name: 'Empty Dish', ingredients: [] });
    expect(generateGroceryList([meal])).toEqual([]);
  });

  it('preserves the original name casing from the first occurrence', () => {
    const meal1 = makeMeal({
      name: 'Dish A',
      ingredients: [{ name: 'Green Chili', quantity: '2', category: 'vegetables' }],
    });
    const meal2 = makeMeal({
      name: 'Dish B',
      id: 'test-002',
      ingredients: [{ name: 'green chili', quantity: '3', category: 'vegetables' }],
    });

    const result = generateGroceryList([meal1, meal2]);
    const chili = result.find((i) => i.name.toLowerCase() === 'green chili');
    expect(chili).toBeDefined();
    expect(chili!.name).toBe('Green Chili');
  });
});
