import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  processIntent,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  STYLE_OPTIONS,
  MAIN_MENU_OPTIONS,
  createDefaultState,
  getComingMondayISO,
} from '../../src/core/botEngine';
import {
  Intent,
  ResponseType,
  type UserState,
  type UserIntent,
  type Meal,
  type ConversationState,
} from '../../src/core/types';
import type { MealRepository } from '../../src/core/ports';

// --- Test meal fixtures (same pattern as unit tests) ---

function makeMeal(overrides: Partial<Meal> & { id: string; name: string; slots: Meal['slots'] }): Meal {
  return {
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    ingredients: [{ name: 'Test Ingredient', quantity: '1 cup', category: 'grains' }],
    ...overrides,
  };
}

const TEST_MEALS: Meal[] = [
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `b-${i}`, name: `Breakfast ${i}`, slots: ['breakfast'] })
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `l-${i}`, name: `Lunch ${i}`, slots: ['lunch'] })
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `d-${i}`, name: `Dinner ${i}`, slots: ['dinner'] })
  ),
];

const mockMealRepo: MealRepository = {
  getMeals: async () => TEST_MEALS,
  getMealById: async (id) => TEST_MEALS.find((m) => m.id === id) ?? null,
};

const stubMealRepo: MealRepository = {
  getMeals: async () => [],
  getMealById: async () => null,
};

// --- Arbitraries ---

const cuisineArb = fc.constantFrom('north_indian' as const, 'south_indian' as const, 'both' as const);
const dietArb = fc.constantFrom('veg' as const, 'non_veg' as const, 'both' as const);
const styleArb = fc.constantFrom('health' as const, 'regular' as const);

const onboardingStateArb = fc.constantFrom(
  'awaiting_cuisine' as ConversationState,
  'awaiting_diet' as ConversationState,
  'awaiting_meal_style' as ConversationState,
);

// Helper to build a state with a valid weekly plan
function makeStateWithPlan(overrides: Partial<UserState> = {}): UserState {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeklyPlan = days.map((day, i) => ({
    day,
    breakfast: TEST_MEALS[i % 8],
    lunch: TEST_MEALS[8 + (i % 8)],
    dinner: TEST_MEALS[16 + (i % 8)],
  }));

  return {
    phoneNumber: '+919999999999',
    onboardingComplete: true,
    conversationState: 'main_menu',
    cuisinePreference: 'north_indian',
    dietPreference: 'veg',
    mealStyle: 'health',
    weeklyPlan,
    weeklyPlanStartDate: getComingMondayISO(),
    ...overrides,
  };
}

// --- Property 1: Onboarding preference persistence round-trip ---
// **Validates: Requirements 1.2, 2.2, 3.2**

describe('Property 1: Onboarding preference persistence round-trip', () => {
  it('selections stored correctly in user state after full onboarding', async () => {
    await fc.assert(
      fc.asyncProperty(cuisineArb, dietArb, styleArb, async (cuisine, diet, style) => {
        // Step 1: New user
        const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, stubMealRepo);

        // Step 2: Select cuisine
        const r2 = await processIntent(
          { intent: Intent.SELECT_CUISINE, payload: cuisine },
          r1.updatedState,
          stubMealRepo,
        );
        expect(r2.updatedState.cuisinePreference).toBe(cuisine);

        // Step 3: Select diet
        const r3 = await processIntent(
          { intent: Intent.SELECT_DIET, payload: diet },
          r2.updatedState,
          stubMealRepo,
        );
        expect(r3.updatedState.dietPreference).toBe(diet);

        // Step 4: Select meal style
        const r4 = await processIntent(
          { intent: Intent.SELECT_MEAL_STYLE, payload: style },
          r3.updatedState,
          stubMealRepo,
        );
        expect(r4.updatedState.mealStyle).toBe(style);

        // All three preferences persisted in final state
        expect(r4.updatedState.cuisinePreference).toBe(cuisine);
        expect(r4.updatedState.dietPreference).toBe(diet);
        expect(r4.updatedState.mealStyle).toBe(style);
      }),
    );
  });
});

// --- Property 2: Invalid input rejection during button-expected states ---
// **Validates: Requirements 1.4, 2.3, 3.4**

describe('Property 2: Invalid input rejection during button-expected states', () => {
  it('UNKNOWN intent returns INVALID_INPUT with non-empty suggestedActions', async () => {
    await fc.assert(
      fc.asyncProperty(onboardingStateArb, async (convState) => {
        const state: UserState = {
          phoneNumber: '+919999999999',
          onboardingComplete: false,
          conversationState: convState,
        };

        const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo);

        expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
        expect(result.response.suggestedActions).toBeDefined();
        expect(result.response.suggestedActions!.length).toBeGreaterThan(0);
        // State should not change
        expect(result.updatedState.conversationState).toBe(convState);
      }),
    );
  });
});

// --- Property 3: Onboarding flow completeness ---
// **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3**

describe('Property 3: Onboarding flow completeness', () => {
  it('after all 3 intents, onboardingComplete=true and state=main_menu', async () => {
    await fc.assert(
      fc.asyncProperty(cuisineArb, dietArb, styleArb, async (cuisine, diet, style) => {
        const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, stubMealRepo);
        const r2 = await processIntent(
          { intent: Intent.SELECT_CUISINE, payload: cuisine },
          r1.updatedState,
          stubMealRepo,
        );
        const r3 = await processIntent(
          { intent: Intent.SELECT_DIET, payload: diet },
          r2.updatedState,
          stubMealRepo,
        );
        const r4 = await processIntent(
          { intent: Intent.SELECT_MEAL_STYLE, payload: style },
          r3.updatedState,
          stubMealRepo,
        );

        expect(r4.updatedState.onboardingComplete).toBe(true);
        expect(r4.updatedState.conversationState).toBe('main_menu');
        expect(r4.response.type).toBe(ResponseType.MAIN_MENU);
      }),
    );
  });
});

// --- Property 11: Action completion returns to main menu ---
// **Validates: Requirements 11.2, 11.3**

describe('Property 11: Action completion returns to main menu', () => {
  it('after any action intent, state is main_menu (except SAVE_COOK_NUMBER → awaiting_cook_number)', async () => {
    const actionIntents = fc.constantFrom(
      Intent.GENERATE_PLAN,
      Intent.VIEW_WEEKLY_GROCERY,
      Intent.SEND_MENU_TO_COOK,
      Intent.SWAP_LUNCH,
      Intent.SAVE_COOK_NUMBER,
    );

    await fc.assert(
      fc.asyncProperty(actionIntents, async (intentType) => {
        const state = makeStateWithPlan({ cookPhoneNumber: '+911234567890' });
        const result = await processIntent(
          { intent: intentType },
          state,
          mockMealRepo,
        );

        if (intentType === Intent.SAVE_COOK_NUMBER) {
          // SAVE_COOK_NUMBER transitions to awaiting_cook_number
          expect(result.updatedState.conversationState).toBe('awaiting_cook_number');
        } else {
          expect(result.updatedState.conversationState).toBe('main_menu');
        }
      }),
    );
  });
});

// --- Property 12: Returning user skips onboarding ---
// **Validates: Requirements 14.3, 19.3**

describe('Property 12: Returning user skips onboarding', () => {
  it('onboardingComplete=true users get INVALID_INPUT (not onboarding prompt) and state stays main_menu', async () => {
    await fc.assert(
      fc.asyncProperty(cuisineArb, dietArb, styleArb, async (cuisine, diet, style) => {
        const state: UserState = {
          phoneNumber: '+919999999999',
          onboardingComplete: true,
          conversationState: 'main_menu',
          cuisinePreference: cuisine,
          dietPreference: diet,
          mealStyle: style,
        };

        const result = await processIntent({ intent: Intent.UNKNOWN }, state, mockMealRepo);

        // Should NOT get any onboarding prompt
        expect(result.response.type).not.toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
        expect(result.response.type).not.toBe(ResponseType.ONBOARDING_DIET_PROMPT);
        expect(result.response.type).not.toBe(ResponseType.ONBOARDING_STYLE_PROMPT);

        // Should get INVALID_INPUT with main menu options
        expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
        expect(result.updatedState.conversationState).toBe('main_menu');
        expect(result.updatedState.onboardingComplete).toBe(true);
      }),
    );
  });
});

// --- Property 17: Suggested actions for all selection points ---
// **Validates: Requirements 16.3, 19.4**

describe('Property 17: Suggested actions for all selection points', () => {
  it('all onboarding step responses have non-empty suggestedActions', async () => {
    await fc.assert(
      fc.asyncProperty(cuisineArb, dietArb, styleArb, async (cuisine, diet, style) => {
        // New user → cuisine prompt
        const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, stubMealRepo);
        expect(r1.response.suggestedActions).toBeDefined();
        expect(r1.response.suggestedActions!.length).toBeGreaterThan(0);

        // Cuisine selected → diet prompt
        const r2 = await processIntent(
          { intent: Intent.SELECT_CUISINE, payload: cuisine },
          r1.updatedState,
          stubMealRepo,
        );
        expect(r2.response.suggestedActions).toBeDefined();
        expect(r2.response.suggestedActions!.length).toBeGreaterThan(0);

        // Diet selected → style prompt
        const r3 = await processIntent(
          { intent: Intent.SELECT_DIET, payload: diet },
          r2.updatedState,
          stubMealRepo,
        );
        expect(r3.response.suggestedActions).toBeDefined();
        expect(r3.response.suggestedActions!.length).toBeGreaterThan(0);

        // Style selected → main menu
        const r4 = await processIntent(
          { intent: Intent.SELECT_MEAL_STYLE, payload: style },
          r3.updatedState,
          stubMealRepo,
        );
        expect(r4.response.suggestedActions).toBeDefined();
        expect(r4.response.suggestedActions!.length).toBeGreaterThan(0);
      }),
    );
  });

  it('main menu GENERATE_PLAN response has non-empty suggestedActions', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.GENERATE_PLAN }, state, mockMealRepo);
    expect(result.response.suggestedActions).toBeDefined();
    expect(result.response.suggestedActions!.length).toBeGreaterThan(0);
  });

  it('main menu INVALID_INPUT response has non-empty suggestedActions', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, mockMealRepo);
    expect(result.response.suggestedActions).toBeDefined();
    expect(result.response.suggestedActions!.length).toBeGreaterThan(0);
  });
});
