import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractTomorrowPlan, swapTomorrowLunch } from '../../src/core/planGenerator';
import type { Meal, DayPlan, WeeklyPlan } from '../../src/core/types';

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

// --- Helper to build a full 7-day WeeklyPlan ---
function makeWeeklyPlan(): WeeklyPlan {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((day, i) => ({
    day,
    breakfast: makeMeal(`b-${i}`, `Breakfast ${day}`),
    lunch: makeMeal(`l-${i}`, `Lunch ${day}`),
    dinner: makeMeal(`d-${i}`, `Dinner ${day}`),
  }));
}

describe('extractTomorrowPlan', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the correct DayPlan when tomorrow falls within the plan week', () => {
    // Plan starts Monday 2024-01-15. If today is Tuesday 2024-01-16,
    // tomorrow is Wednesday 2024-01-17 → index 2
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 16)); // Jan 16, 2024 (Tuesday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).not.toBeNull();
    expect(result!.day).toBe('Wednesday'); // index 2
  });

  it('returns Monday plan when tomorrow is the plan start date', () => {
    // Plan starts Monday 2024-01-15. If today is Sunday 2024-01-14,
    // tomorrow is Monday 2024-01-15 → index 0
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 14)); // Jan 14, 2024 (Sunday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).not.toBeNull();
    expect(result!.day).toBe('Monday'); // index 0
  });

  it('returns Sunday plan when tomorrow is the last day of the plan', () => {
    // Plan starts Monday 2024-01-15. If today is Saturday 2024-01-20,
    // tomorrow is Sunday 2024-01-21 → index 6
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 20)); // Jan 20, 2024 (Saturday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).not.toBeNull();
    expect(result!.day).toBe('Sunday'); // index 6
  });

  it('returns null when tomorrow is before the plan start date', () => {
    // Plan starts Monday 2024-01-15. If today is Saturday 2024-01-13,
    // tomorrow is Sunday 2024-01-14 → before plan start
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 13)); // Jan 13, 2024 (Saturday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).toBeNull();
  });

  it('returns null when tomorrow is after the plan end date', () => {
    // Plan starts Monday 2024-01-15 (covers Mon-Sun, Jan 15-21).
    // If today is Sunday 2024-01-21, tomorrow is Monday 2024-01-22 → index 7, out of range
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 21)); // Jan 21, 2024 (Sunday)

    const plan = makeWeeklyPlan();
    const result = extractTomorrowPlan(plan, '2024-01-15');

    expect(result).toBeNull();
  });

  it('returns the correct day for each day index 0-6', () => {
    vi.useFakeTimers();
    const plan = makeWeeklyPlan();
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // Plan starts 2024-01-15 (Monday). To get index i, tomorrow must be Jan 15+i,
    // so today must be Jan 14+i.
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
    // Tomorrow is Jan 16 → index 1, but plan is empty
    expect(result).toBeNull();
  });
});


// --- Helpers for swapTomorrowLunch tests ---

function makeLunchMeal(id: string, name: string): Meal {
  return {
    id,
    name,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots: ['lunch'],
    ingredients: [{ name: 'Ingredient', quantity: '100g', category: 'vegetables' }],
  };
}

function makeSlotMeal(id: string, name: string, slots: ('breakfast' | 'lunch' | 'dinner')[]): Meal {
  return {
    id,
    name,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots,
    ingredients: [{ name: 'Ingredient', quantity: '100g', category: 'vegetables' }],
  };
}

function makeSwapWeeklyPlan(): WeeklyPlan {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((day, i) => ({
    day,
    breakfast: makeSlotMeal(`b-${i}`, `Breakfast ${day}`, ['breakfast']),
    lunch: makeLunchMeal(`l-${i}`, `Lunch ${day}`),
    dinner: makeSlotMeal(`d-${i}`, `Dinner ${day}`, ['dinner']),
  }));
}

const defaultPrefs = { cuisine: 'north_indian', diet: 'veg', style: 'health' };

describe('swapTomorrowLunch', () => {
  it('swaps lunch with a valid replacement and returns old/new names', () => {
    const plan = makeSwapWeeklyPlan();
    const candidate = makeLunchMeal('new-lunch', 'New Lunch Dish');
    const meals = [candidate];

    const result = swapTomorrowLunch(plan, 3, meals, defaultPrefs);

    expect(result).not.toBeNull();
    expect(result!.oldMeal).toBe('Lunch Thursday');
    expect(result!.newMeal).toBe('New Lunch Dish');
    expect(result!.updatedPlan[3].lunch.id).toBe('new-lunch');
  });

  it('does not mutate the original plan', () => {
    const plan = makeSwapWeeklyPlan();
    const originalLunchId = plan[3].lunch.id;
    const candidate = makeLunchMeal('new-lunch', 'New Lunch Dish');

    swapTomorrowLunch(plan, 3, [candidate], defaultPrefs);

    expect(plan[3].lunch.id).toBe(originalLunchId);
  });

  it('returns null when no valid replacement exists (all candidates excluded)', () => {
    const plan = makeSwapWeeklyPlan();
    // Only candidate is the current lunch itself
    const meals = [plan[3].lunch];

    const result = swapTomorrowLunch(plan, 3, meals, defaultPrefs);

    expect(result).toBeNull();
  });

  it('excludes meals that duplicate same-day breakfast', () => {
    const plan = makeSwapWeeklyPlan();
    // Make the only candidate have the same id as the breakfast
    const breakfastDupe = makeLunchMeal(plan[3].breakfast.id, 'Dupe Breakfast');
    breakfastDupe.slots = ['breakfast', 'lunch'];

    const result = swapTomorrowLunch(plan, 3, [breakfastDupe], defaultPrefs);

    expect(result).toBeNull();
  });

  it('excludes meals that duplicate same-day dinner', () => {
    const plan = makeSwapWeeklyPlan();
    const dinnerDupe = makeLunchMeal(plan[3].dinner.id, 'Dupe Dinner');
    dinnerDupe.slots = ['lunch', 'dinner'];

    const result = swapTomorrowLunch(plan, 3, [dinnerDupe], defaultPrefs);

    expect(result).toBeNull();
  });

  it('excludes meals that duplicate previous day lunch', () => {
    const plan = makeSwapWeeklyPlan();
    // Candidate has same id as Wednesday lunch (index 2, adjacent to index 3)
    const prevDayDupe = makeLunchMeal(plan[2].lunch.id, 'Prev Day Lunch');

    const result = swapTomorrowLunch(plan, 3, [prevDayDupe], defaultPrefs);

    expect(result).toBeNull();
  });

  it('excludes meals that duplicate next day lunch', () => {
    const plan = makeSwapWeeklyPlan();
    // Candidate has same id as Friday lunch (index 4, adjacent to index 3)
    const nextDayDupe = makeLunchMeal(plan[4].lunch.id, 'Next Day Lunch');

    const result = swapTomorrowLunch(plan, 3, [nextDayDupe], defaultPrefs);

    expect(result).toBeNull();
  });

  it('works for Monday (index 0) — no previous day to check', () => {
    const plan = makeSwapWeeklyPlan();
    const candidate = makeLunchMeal('new-lunch', 'New Monday Lunch');

    const result = swapTomorrowLunch(plan, 0, [candidate], defaultPrefs);

    expect(result).not.toBeNull();
    expect(result!.updatedPlan[0].lunch.id).toBe('new-lunch');
  });

  it('works for Sunday (index 6) — no next day to check', () => {
    const plan = makeSwapWeeklyPlan();
    const candidate = makeLunchMeal('new-lunch', 'New Sunday Lunch');

    const result = swapTomorrowLunch(plan, 6, [candidate], defaultPrefs);

    expect(result).not.toBeNull();
    expect(result!.updatedPlan[6].lunch.id).toBe('new-lunch');
  });

  it('returns null for invalid tomorrowIndex (negative)', () => {
    const plan = makeSwapWeeklyPlan();
    const candidate = makeLunchMeal('new-lunch', 'Candidate');

    const result = swapTomorrowLunch(plan, -1, [candidate], defaultPrefs);

    expect(result).toBeNull();
  });

  it('returns null for invalid tomorrowIndex (> 6)', () => {
    const plan = makeSwapWeeklyPlan();
    const candidate = makeLunchMeal('new-lunch', 'Candidate');

    const result = swapTomorrowLunch(plan, 7, [candidate], defaultPrefs);

    expect(result).toBeNull();
  });

  it('only considers meals with lunch slot compatibility', () => {
    const plan = makeSwapWeeklyPlan();
    // Candidate is breakfast-only — should not be picked
    const breakfastOnly = makeSlotMeal('bf-only', 'Breakfast Only', ['breakfast']);

    const result = swapTomorrowLunch(plan, 3, [breakfastOnly], defaultPrefs);

    expect(result).toBeNull();
  });

  it('returns null when meals array is empty', () => {
    const plan = makeSwapWeeklyPlan();

    const result = swapTomorrowLunch(plan, 3, [], defaultPrefs);

    expect(result).toBeNull();
  });
});
