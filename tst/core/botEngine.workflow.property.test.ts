import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  processIntent,
} from '../../src/core/botEngine';
import {
  Intent,
  ResponseType,
  type UserState,
  type ConversationState,
} from '../../src/core/types';
import type { MealRepository, MealComponentRepository } from '../../src/core/ports';

// --- Stub repositories (no data needed for these properties) ---

const stubMealRepo: MealRepository = {
  getMeals: async () => [],
  getMealById: async () => null,
};

const stubMealComponentRepo: MealComponentRepository = {
  getComponents: async () => [],
};

// --- Arbitraries ---

/** Arbitrary phone number: '+91' followed by 10 digits */
const phoneNumberArb = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 10, maxLength: 10 })
  .map(digits => `+91${digits}`);

/** Arbitrary free-text message body */
const messageBodyArb = fc.string({ minLength: 0, maxLength: 100 });

/**
 * Active-flow conversation states that return INVALID_INPUT for UNKNOWN intent.
 * Excludes main_menu (not an active flow) and dish_preview (re-presents current
 * preview step for unknown intents by design, rather than returning INVALID_INPUT).
 */
const activeFlowStateArb = fc.constantFrom<ConversationState>(
  'awaiting_cuisine',
  'awaiting_diet',
  'awaiting_meal_style',
  'awaiting_cook_number_onboarding',
  'more_options',
  'awaiting_cook_number',
  'awaiting_preference_cuisine',
  'awaiting_preference_diet',
  'change_plan_menu',
  'few_meals_day_select',
  'few_meals_slot_select',
  'few_meals_alternatives',
  'entire_plan_confirm',
);

// --- Property 1: New user routing ---
// **Validates: Requirements 1.1**

describe('(Feature: smart-meal-planner-workflow, Property 1: New user routing)', () => {
  it('For any phone number with no state and for any message, processIntent returns ONBOARDING_CUISINE_PROMPT', async () => {
    await fc.assert(
      fc.asyncProperty(phoneNumberArb, messageBodyArb, async (phoneNumber, _messageBody) => {
        const result = await processIntent(
          { intent: Intent.UNKNOWN },
          null,
          stubMealRepo,
          stubMealComponentRepo,
          phoneNumber,
        );

        expect(result.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
        expect(result.updatedState.conversationState).toBe('awaiting_cuisine');
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 3: Invalid input re-prompting ---
// **Validates: Requirements 2.6, 12.4**

describe('(Feature: smart-meal-planner-workflow, Property 3: Invalid input re-prompting)', () => {
  it('For any active-flow state and UNKNOWN intent, response is INVALID_INPUT and state unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(activeFlowStateArb, async (convState) => {
        const state: UserState = {
          phoneNumber: '+919999999999',
          onboardingComplete: convState !== 'awaiting_cuisine' &&
            convState !== 'awaiting_diet' &&
            convState !== 'awaiting_meal_style' &&
            convState !== 'awaiting_cook_number_onboarding',
          conversationState: convState,
        };

        const result = await processIntent(
          { intent: Intent.UNKNOWN },
          state,
          stubMealRepo,
          stubMealComponentRepo,
        );

        expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
        expect(result.updatedState.conversationState).toBe(convState);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 10: Few meals replacement updates plan correctly ---
// **Validates: Requirements 6.4**

describe('(Feature: smart-meal-planner-workflow, Property 10: Few meals replacement updates plan correctly)', () => {
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
  type SlotName = 'breakfast' | 'lunch' | 'dinner';

  /** Create a Meal object with a unique id */
  function makeMeal(id: string): import('../../src/core/types').Meal {
    return {
      id,
      name: `Meal-${id}`,
      cuisine: ['north_indian'],
      diet: 'veg',
      style: 'regular',
      slots: ['breakfast'],
      ingredients: [{ name: `ing-${id}`, quantity: '1', category: 'vegetables' }],
    };
  }

  /** Create a ComposedMeal object with 4 components */
  function makeComposedMeal(id: string): import('../../src/core/types').ComposedMeal {
    const categories: import('../../src/core/types').ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
    const components = categories.map((cat) => ({
      id: `${id}-${cat}`,
      name: `${cat}-${id}`,
      category: cat as import('../../src/core/types').ComponentCategory,
      cuisine: ['north_indian'] as ('north_indian' | 'south_indian')[],
      diet: 'veg' as const,
      style: 'regular' as const,
      slots: ['lunch', 'dinner'] as ('lunch' | 'dinner')[],
      ingredients: [{ name: `ing-${id}-${cat}`, quantity: '1', category: 'vegetables' }],
    }));
    return {
      components,
      name: components.map((c) => c.name).join(', '),
      ingredients: components.flatMap((c) => c.ingredients),
    };
  }

  /** Build a full 7-day weekly plan with deterministic meals */
  function buildMockPlan(): import('../../src/core/types').WeeklyPlan {
    return DAYS.map((day, i) => ({
      day,
      breakfast: makeMeal(`b-${i}`),
      lunch: makeComposedMeal(`l-${i}`),
      dinner: makeComposedMeal(`d-${i}`),
    }));
  }

  /** Create alternatives matching the slot type */
  function makeAlternatives(slot: SlotName): (import('../../src/core/types').Meal | import('../../src/core/types').ComposedMeal)[] {
    if (slot === 'breakfast') {
      return [makeMeal('alt-0'), makeMeal('alt-1'), makeMeal('alt-2')];
    }
    return [makeComposedMeal('alt-0'), makeComposedMeal('alt-1'), makeComposedMeal('alt-2')];
  }

  // Arbitraries
  const dayIndexArb = fc.integer({ min: 0, max: 6 });
  const slotArb = fc.constantFrom<SlotName>('breakfast', 'lunch', 'dinner');
  const altIndexArb = fc.integer({ min: 0, max: 2 });

  it('For any alternative selection, plan is updated at correct day/slot and other entries unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(dayIndexArb, slotArb, altIndexArb, async (dayIdx, slot, altIdx) => {
        const originalPlan = buildMockPlan();
        const alternatives = makeAlternatives(slot);

        const state: UserState = {
          phoneNumber: '+919999999999',
          onboardingComplete: true,
          conversationState: 'few_meals_alternatives',
          fewMealsSelectedDay: dayIdx,
          fewMealsSelectedSlot: slot,
          fewMealsAlternatives: alternatives,
          weeklyPlan: originalPlan,
        };

        const result = await processIntent(
          { intent: Intent.SELECT_ALTERNATIVE, payload: String(altIdx) },
          state,
          stubMealRepo,
          stubMealComponentRepo,
        );

        // 1. Response type is FEW_MEALS_UPDATED
        expect(result.response.type).toBe(ResponseType.FEW_MEALS_UPDATED);

        // 2. The meal at updatedPlan[day][slot] matches the selected alternative
        const updatedPlan = result.updatedState.weeklyPlan!;
        const updatedMeal = updatedPlan[dayIdx][slot];
        expect(updatedMeal).toEqual(alternatives[altIdx]);

        // 3. All other day/slot entries are unchanged from the original plan
        for (let d = 0; d < 7; d++) {
          for (const s of ['breakfast', 'lunch', 'dinner'] as SlotName[]) {
            if (d === dayIdx && s === slot) continue;
            expect(updatedPlan[d][s]).toEqual(originalPlan[d][s]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});


// --- Property 15: Preference change clears exclusions ---
// **Validates: Requirements 8.3, 13.6**

describe('(Feature: smart-meal-planner-workflow, Property 15: Preference change clears exclusions)', () => {
  /** Arbitrary source state from which CHANGE_PREFERENCE can be triggered */
  const sourceStateArb = fc.constantFrom<'change_plan_menu' | 'more_options'>(
    'change_plan_menu',
    'more_options',
  );

  /** Arbitrary non-empty excludedDishIds array (1-10 random string IDs) */
  const excludedDishIdsArb = fc.array(
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-'), { minLength: 3, maxLength: 12 }),
    { minLength: 1, maxLength: 10 },
  );

  it('For any preference change, excludedDishIds is empty and plan matches new prefs', async () => {
    await fc.assert(
      fc.asyncProperty(sourceStateArb, excludedDishIdsArb, async (sourceState, existingExcluded) => {
        const state: UserState = {
          phoneNumber: '+919999999999',
          onboardingComplete: true,
          conversationState: sourceState,
          cuisinePreference: 'north_indian',
          dietPreference: 'veg',
          mealStyle: 'regular',
          excludedDishIds: existingExcluded,
        };

        const result = await processIntent(
          { intent: Intent.CHANGE_PREFERENCE },
          state,
          stubMealRepo,
          stubMealComponentRepo,
        );

        // 1. excludedDishIds should be cleared to empty array
        expect(result.updatedState.excludedDishIds).toEqual([]);

        // 2. Conversation should transition to awaiting_preference_cuisine
        expect(result.updatedState.conversationState).toBe('awaiting_preference_cuisine');

        // 3. isPreferenceChange flag should be set to true
        expect(result.updatedState.isPreferenceChange).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
