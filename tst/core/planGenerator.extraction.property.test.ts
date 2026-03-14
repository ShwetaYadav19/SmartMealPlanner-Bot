import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { extractTomorrowPlan } from '../../src/core/planGenerator';
import type { Meal, DayPlan, WeeklyPlan } from '../../src/core/types';

// --- Helpers ---

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function makeMeal(id: string, slot: string): Meal {
  return {
    id,
    name: `Meal ${id}`,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots: [slot as 'breakfast' | 'lunch' | 'dinner'],
    ingredients: [{ name: 'Ingredient', quantity: '100g', category: 'vegetables' }],
  };
}

function buildWeeklyPlan(): WeeklyPlan {
  return DAYS.map((day, i) => ({
    day,
    breakfast: makeMeal(`b-${i}`, 'breakfast'),
    lunch: makeMeal(`l-${i}`, 'lunch'),
    dinner: makeMeal(`d-${i}`, 'dinner'),
  }));
}

/**
 * Format a Date as an ISO date string (YYYY-MM-DD).
 */
function toISODateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// Property 8: Tomorrow's plan extraction correctness
// Validates: Requirements 6.1
// ============================================================

describe('Property 8: Tomorrow\'s plan extraction correctness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * For any plan and day index 0–6, when the system time is set so that
   * tomorrow falls on that index relative to the plan start date,
   * extractTomorrowPlan returns the correct DayPlan at that index.
   */
  it('returns the correct day plan for each day index 0–6', () => {
    fc.assert(
      fc.property(
        // Generate a random base date (year 2020–2030, month 0–11, day 1–28)
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 28 }),
        // Day index 0–6
        fc.integer({ min: 0, max: 6 }),
        (year, month, day, dayIndex) => {
          const plan = buildWeeklyPlan();

          // Plan starts on this date
          const startDate = new Date(year, month, day);
          const startDateStr = toISODateString(startDate);

          // Tomorrow should land on dayIndex, so today = startDate + dayIndex - 1
          // (because tomorrow = today + 1, and diffDays = tomorrow - startDate = dayIndex)
          const todayDate = new Date(year, month, day + dayIndex - 1);
          vi.setSystemTime(todayDate);

          const result = extractTomorrowPlan(plan, startDateStr);

          expect(result).not.toBeNull();
          expect(result!.day).toBe(DAYS[dayIndex]);
          expect(result!.breakfast.id).toBe(`b-${dayIndex}`);
          expect(result!.lunch.id).toBe(`l-${dayIndex}`);
          expect(result!.dinner.id).toBe(`d-${dayIndex}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * When tomorrow falls before the plan start date (dayIndex < 0) or
   * after the plan end (dayIndex > 6), extractTomorrowPlan returns null.
   */
  it('returns null when tomorrow is outside the plan range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 28 }),
        // Offset that puts tomorrow outside 0–6 range
        fc.oneof(
          fc.integer({ min: -365, max: -1 }),  // before plan
          fc.integer({ min: 7, max: 365 }),     // after plan
        ),
        (year, month, day, offset) => {
          const plan = buildWeeklyPlan();

          const startDate = new Date(year, month, day);
          const startDateStr = toISODateString(startDate);

          // Set today so that tomorrow = startDate + offset
          // tomorrow = today + 1, so today = startDate + offset - 1
          const todayDate = new Date(year, month, day + offset - 1);
          vi.setSystemTime(todayDate);

          const result = extractTomorrowPlan(plan, startDateStr);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
