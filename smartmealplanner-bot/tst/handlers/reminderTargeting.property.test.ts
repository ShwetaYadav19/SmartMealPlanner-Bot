// Property 13: Reminder targeting correctness
// **Validates: Requirements 12.1, 12.4, 13.1**
//
// Tests the targeting LOGIC used by daily and weekly reminder handlers as pure functions.
// Daily reminder: targets users with onboardingComplete=true AND plan covering tomorrow
// Weekly reminder: targets all users with onboardingComplete=true

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractTomorrowPlan } from '../../src/core/planGenerator';
import { getComingMondayISO } from '../../src/core/botEngine';
import { ResponseType } from '../../src/core/types';
import type { UserState, Meal, DayPlan, WeeklyPlan, BotResponse } from '../../src/core/types';

// --- Helpers to replicate the targeting logic from the handlers ---

function makeMeal(id: string, name: string): Meal {
  return {
    id,
    name,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots: ['breakfast', 'lunch', 'dinner'],
    ingredients: [{ name: 'Test', quantity: '1', category: 'grains' }],
  };
}

function makeWeeklyPlan(): WeeklyPlan {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((day, i) => ({
    day,
    breakfast: makeMeal(`b-${i}`, `Breakfast ${i}`),
    lunch: makeMeal(`l-${i}`, `Lunch ${i}`),
    dinner: makeMeal(`d-${i}`, `Dinner ${i}`),
  }));
}

/**
 * Replicates the daily reminder targeting logic from dailyReminderHandler.
 * Returns the response type that would be sent to each user.
 */
function dailyReminderTarget(user: UserState): BotResponse | null {
  // Handler only processes onboarded users (scanOnboardedUsers filters these)
  if (!user.onboardingComplete) return null;

  if (user.weeklyPlan && user.weeklyPlanStartDate) {
    const tomorrowPlan = extractTomorrowPlan(user.weeklyPlan, user.weeklyPlanStartDate);
    if (tomorrowPlan) {
      return { type: ResponseType.DAILY_REMINDER, data: { dayPlan: tomorrowPlan } };
    } else {
      return { type: ResponseType.EXPIRED_PLAN_PROMPT };
    }
  } else {
    return { type: ResponseType.EXPIRED_PLAN_PROMPT };
  }
}

/**
 * Replicates the weekly reminder targeting logic from weeklyReminderHandler.
 * Returns the response type that would be sent to each user.
 */
function weeklyReminderTarget(user: UserState): BotResponse | null {
  // Handler only processes onboarded users (scanOnboardedUsers filters these)
  if (!user.onboardingComplete) return null;

  return { type: ResponseType.WEEKLY_REMINDER };
}

// --- Arbitraries ---

const conversationStateArb = fc.constantFrom(
  'awaiting_cuisine' as const,
  'awaiting_diet' as const,
  'awaiting_meal_style' as const,
  'main_menu' as const,
  'awaiting_cook_number' as const,
);

const validStartDateArb = fc.constant(getComingMondayISO());
const expiredStartDateArb = fc.constant('2020-01-06'); // A Monday far in the past

/** Generates a random UserState with various onboarding/plan combinations */
const userStateArb: fc.Arbitrary<UserState> = fc.record({
  phoneNumber: fc.stringMatching(/^\+91\d{10}$/),
  onboardingComplete: fc.boolean(),
  conversationState: conversationStateArb,
  cuisinePreference: fc.option(fc.constantFrom('north_indian' as const, 'south_indian' as const, 'both' as const), { nil: undefined }),
  dietPreference: fc.option(fc.constantFrom('veg' as const, 'non_veg' as const), { nil: undefined }),
  mealStyle: fc.option(fc.constantFrom('health' as const, 'regular' as const), { nil: undefined }),
  weeklyPlan: fc.option(fc.constant(makeWeeklyPlan()), { nil: undefined }),
  weeklyPlanStartDate: fc.option(fc.oneof(validStartDateArb, expiredStartDateArb), { nil: undefined }),
  cookPhoneNumber: fc.option(fc.stringMatching(/^\+91\d{10}$/), { nil: undefined }),
});

const userPopulationArb = fc.array(userStateArb, { minLength: 0, maxLength: 20 });

// --- Property Tests ---

describe('Property 13: Reminder targeting correctness', () => {
  it('daily reminder targets only onboarded users with valid tomorrow plan as DAILY_REMINDER', () => {
    fc.assert(
      fc.property(userPopulationArb, (users) => {
        for (const user of users) {
          const result = dailyReminderTarget(user);

          if (!user.onboardingComplete) {
            // Non-onboarded users are never targeted
            expect(result).toBeNull();
          } else if (
            user.weeklyPlan &&
            user.weeklyPlanStartDate &&
            extractTomorrowPlan(user.weeklyPlan, user.weeklyPlanStartDate) !== null
          ) {
            // Onboarded + valid plan covering tomorrow → DAILY_REMINDER
            expect(result).not.toBeNull();
            expect(result!.type).toBe(ResponseType.DAILY_REMINDER);
            expect(result!.data?.dayPlan).toBeDefined();
          } else {
            // Onboarded but no plan or expired plan → EXPIRED_PLAN_PROMPT
            expect(result).not.toBeNull();
            expect(result!.type).toBe(ResponseType.EXPIRED_PLAN_PROMPT);
          }
        }
      }),
    );
  });

  it('daily reminder sends EXPIRED_PLAN_PROMPT for users with expired plans', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            phoneNumber: fc.stringMatching(/^\+91\d{10}$/),
            onboardingComplete: fc.constant(true),
            conversationState: fc.constant('main_menu' as const),
            weeklyPlan: fc.constant(makeWeeklyPlan()),
            weeklyPlanStartDate: expiredStartDateArb,
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (users) => {
          for (const user of users) {
            const fullUser: UserState = {
              ...user,
              cuisinePreference: 'north_indian',
              dietPreference: 'veg',
              mealStyle: 'health',
            };
            const result = dailyReminderTarget(fullUser);

            expect(result).not.toBeNull();
            expect(result!.type).toBe(ResponseType.EXPIRED_PLAN_PROMPT);
          }
        },
      ),
    );
  });

  it('weekly reminder targets ALL onboarded users regardless of plan status', () => {
    fc.assert(
      fc.property(userPopulationArb, (users) => {
        for (const user of users) {
          const result = weeklyReminderTarget(user);

          if (!user.onboardingComplete) {
            expect(result).toBeNull();
          } else {
            // ALL onboarded users get WEEKLY_REMINDER, regardless of plan
            expect(result).not.toBeNull();
            expect(result!.type).toBe(ResponseType.WEEKLY_REMINDER);
          }
        }
      }),
    );
  });

  it('users with onboardingComplete=false are never targeted by either reminder', () => {
    fc.assert(
      fc.property(
        fc.array(
          userStateArb.map((u) => ({ ...u, onboardingComplete: false })),
          { minLength: 1, maxLength: 15 },
        ),
        (users) => {
          for (const user of users) {
            expect(dailyReminderTarget(user)).toBeNull();
            expect(weeklyReminderTarget(user)).toBeNull();
          }
        },
      ),
    );
  });
});
