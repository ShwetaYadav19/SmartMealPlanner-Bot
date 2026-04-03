import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractTomorrowPlan, swapTomorrowLunch } from '../../src/core/planGenerator';
import type { Meal, DayPlan, WeeklyPlan, MealComponent, ComposedMeal } from '../../src/core/types';

// --- Helper to build a minimal Meal ---
function makeMeal(id: string, name: string): Meal {
  return {
    id,
    name,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots: ['breakfast'],
    ingredients: [{ name: 'Ingredient', quantity: '100g', category: 'vegetables' }],
  };
}

// --- Helper to build a ComposedMeal from a simple name ---
function makeComposedMeal(name: string, gravyId: string = 'gravy-001'): ComposedMeal {
  const base: MealComponent = {
    id: `base-${name}`, name: `${name} Base`, category: 'base',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Rice', quantity: '200g', category: 'grains' }],
  };
  const gravy: MealComponent = {
    id: gravyId, name: `${name} Gravy`, category: 'gravy',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Dal', quantity: '100g', category: 'lentils' }],
  };
  const dryVeggie: MealComponent = {
    id: `dry-${name}`, name: `${name} Dry`, category: 'dry_veggie',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Beans', quantity: '100g', category: 'vegetables' }],
  };
  const side: MealComponent = {
    id: `side-${name}`, name: `${name} Side`, category: 'side',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Curd', quantity: '100ml', category: 'dairy' }],
  };
  return {
    components: [base, gravy, dryVeggie, side],
    name: [base, gravy, dryVeggie, side].map(c => c.name).join(', '),
    ingredients: [base, gravy, dryVeggie, side].flatMap(c => c.ingredients),
  };
}

// --- Helper to build a full 7-day WeeklyPlan ---
function makeWeeklyPlan(): WeeklyPlan {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((day, i) => ({
    day,
    breakfast: makeMeal(`b-${i}`, `Breakfast ${day}`),
    lunch: makeComposedMeal(`Lunch-${day}`, `lunch-gravy-${i}`),
    dinner: makeComposedMeal(`Dinner-${day}`, `dinner-gravy-${i}`),
  }));
}

describe('extractTomorrowPlan', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the correct DayPlan when tomorrow falls within the plan week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 16)); // Jan 16, 2024 (Tuesday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).not.toBeNull();
    expect(result!.day).toBe('Wednesday'); // index 2
  });

  it('returns Monday plan when tomorrow is the plan start date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 14)); // Jan 14, 2024 (Sunday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).not.toBeNull();
    expect(result!.day).toBe('Monday'); // index 0
  });

  it('returns Sunday plan when tomorrow is the last day of the plan', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 20)); // Jan 20, 2024 (Saturday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).not.toBeNull();
    expect(result!.day).toBe('Sunday'); // index 6
  });

  it('returns null when tomorrow is before the plan start date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 13)); // Jan 13, 2024 (Saturday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).toBeNull();
  });

  it('wraps around when tomorrow is after the plan end date (cycles the plan)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 21)); // Jan 21, 2024 (Sunday) — tomorrow is Mon Jan 22, diffDays=7

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    // diffDays=7, 7%7=0 → wraps to Monday
    expect(result).not.toBeNull();
    expect(result!.day).toBe('Monday');
  });

  it('returns the correct day for each day index 0-6', () => {
    vi.useFakeTimers();
    const plan = makeWeeklyPlan();
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    for (let i = 0; i < 7; i++) {
      vi.setSystemTime(new Date(2024, 0, 14 + i));
      const result = extractTomorrowPlan(plan, '2024-01-15');
      expect(result).not.toBeNull();
      expect(result!.day).toBe(days[i]);
    }
  });

  it('returns null for an empty plan array', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15));

    const result = extractTomorrowPlan([], '2024-01-15');
    expect(result).toBeNull();
  });
});


// --- Helpers for swapTomorrowLunch tests ---

/**
 * Build a MealComponent pool with enough components per category for swap tests.
 */
function buildComponentPool(): MealComponent[] {
  const categories = ['base', 'gravy', 'dry_veggie', 'side'] as const;
  const components: MealComponent[] = [];
  for (const cat of categories) {
    for (let i = 0; i < 10; i++) {
      components.push({
        id: `ni-${cat}-${String(i).padStart(3, '0')}`,
        name: `NI ${cat} ${i}`,
        category: cat,
        cuisine: 'north_indian',
        diet: 'veg',
        style: 'health',
        slots: ['lunch', 'dinner'],
        ingredients: [{ name: `Ingredient ${cat} ${i}`, quantity: '100g', category: 'vegetables' }],
      });
    }
  }
  return components;
}

function makeSwapWeeklyPlan(): WeeklyPlan {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((day, i) => ({
    day,
    breakfast: makeMeal(`b-${i}`, `Breakfast ${day}`),
    lunch: makeComposedMeal(`Lunch-${day}`, `lunch-gravy-${i}`),
    dinner: makeComposedMeal(`Dinner-${day}`, `dinner-gravy-${i}`),
  }));
}

const defaultPrefs = { cuisine: 'north_indian', diet: 'veg', style: 'health' };

describe('swapTomorrowLunch', () => {
  it('swaps lunch with a valid replacement and returns old/new names', () => {
    const plan = makeSwapWeeklyPlan();
    const components = buildComponentPool();

    const result = swapTomorrowLunch(plan, 3, components, defaultPrefs);

    expect(result).not.toBeNull();
    expect(result!.oldMeal).toBe(plan[3].lunch.name);
    expect(result!.newMeal).toBeDefined();
    expect(result!.newMeal).not.toBe('');
    // The new lunch should be a ComposedMeal with components
    expect(result!.updatedPlan[3].lunch.components).toBeDefined();
    expect(result!.updatedPlan[3].lunch.components).toHaveLength(4);
  });

  it('does not mutate the original plan', () => {
    const plan = makeSwapWeeklyPlan();
    const originalLunchName = plan[3].lunch.name;
    const components = buildComponentPool();

    swapTomorrowLunch(plan, 3, components, defaultPrefs);

    expect(plan[3].lunch.name).toBe(originalLunchName);
  });

  it('returns null when no valid replacement exists (empty components)', () => {
    const plan = makeSwapWeeklyPlan();

    const result = swapTomorrowLunch(plan, 3, [], defaultPrefs);

    expect(result).toBeNull();
  });

  it('works for Monday (index 0) — no previous day to check', () => {
    const plan = makeSwapWeeklyPlan();
    const components = buildComponentPool();

    const result = swapTomorrowLunch(plan, 0, components, defaultPrefs);

    expect(result).not.toBeNull();
    expect(result!.updatedPlan[0].lunch.components).toHaveLength(4);
  });

  it('works for Sunday (index 6) — no next day to check', () => {
    const plan = makeSwapWeeklyPlan();
    const components = buildComponentPool();

    const result = swapTomorrowLunch(plan, 6, components, defaultPrefs);

    expect(result).not.toBeNull();
    expect(result!.updatedPlan[6].lunch.components).toHaveLength(4);
  });

  it('returns null for invalid tomorrowIndex (negative)', () => {
    const plan = makeSwapWeeklyPlan();
    const components = buildComponentPool();

    const result = swapTomorrowLunch(plan, -1, components, defaultPrefs);

    expect(result).toBeNull();
  });

  it('returns null for invalid tomorrowIndex (> 6)', () => {
    const plan = makeSwapWeeklyPlan();
    const components = buildComponentPool();

    const result = swapTomorrowLunch(plan, 7, components, defaultPrefs);

    expect(result).toBeNull();
  });

  it('the swapped lunch gravy differs from the original', () => {
    const plan = makeSwapWeeklyPlan();
    const components = buildComponentPool();

    const originalGravyId = plan[3].lunch.components.find(c => c.category === 'gravy')?.id;
    const result = swapTomorrowLunch(plan, 3, components, defaultPrefs);

    if (result) {
      const newGravyId = result.updatedPlan[3].lunch.components.find(c => c.category === 'gravy')?.id;
      expect(newGravyId).not.toBe(originalGravyId);
    }
  });
});
