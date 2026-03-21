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
  type MealComponent,
  type ComposedMeal,
  type ConversationState,
} from '../../src/core/types';
import type { MealRepository, MealComponentRepository } from '../../src/core/ports';

// --- Test meal fixtures ---

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
];

const TEST_COMPONENTS: MealComponent[] = (() => {
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
})();

function makeComposedMeal(prefix: string, gravyId: string): ComposedMeal {
  const base: MealComponent = {
    id: `${prefix}-base`, name: `${prefix} Base`, category: 'base',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Rice', quantity: '200g', category: 'grains' }],
  };
  const gravy: MealComponent = {
    id: gravyId, name: `${prefix} Gravy`, category: 'gravy',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Dal', quantity: '100g', category: 'lentils' }],
  };
  const dry: MealComponent = {
    id: `${prefix}-dry`, name: `${prefix} Dry`, category: 'dry_veggie',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Beans', quantity: '100g', category: 'vegetables' }],
  };
  const side: MealComponent = {
    id: `${prefix}-side`, name: `${prefix} Side`, category: 'side',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Curd', quantity: '100ml', category: 'dairy' }],
  };
  const components = [base, gravy, dry, side];
  return {
    components,
    name: components.map(c => c.name).join(', '),
    ingredients: components.flatMap(c => c.ingredients),
  };
}

const mockMealRepo: MealRepository = {
  getMeals: async () => TEST_MEALS,
  getMealById: async (id) => TEST_MEALS.find((m) => m.id === id) ?? null,
};

const mockMealComponentRepo: MealComponentRepository = {
  getComponents: async () => TEST_COMPONENTS,
};

const stubMealRepo: MealRepository = {
  getMeals: async () => [],
  getMealById: async () => null,
};

const stubMealComponentRepo: MealComponentRepository = {
  getComponents: async () => [],
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
    lunch: makeComposedMeal(`l-${i}`, `lunch-gravy-${i}`),
    dinner: makeComposedMeal(`d-${i}`, `dinner-gravy-${i}`),
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
    // Use fixed preferences matching test data (north_indian/veg/health)
    // since handleAwaitingMealStyle now builds a real plan from components
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mockMealRepo, mockMealComponentRepo);
    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r2.updatedState.cuisinePreference).toBe('north_indian');
    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r3.updatedState.dietPreference).toBe('veg');
    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' },
      r3.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r4.updatedState.mealStyle).toBe('health');
    expect(r4.updatedState.cuisinePreference).toBe('north_indian');
    expect(r4.updatedState.dietPreference).toBe('veg');
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
        const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo, stubMealComponentRepo);
        expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
        expect(result.response.suggestedActions).toBeDefined();
        expect(result.response.suggestedActions!.length).toBeGreaterThan(0);
        expect(result.updatedState.conversationState).toBe(convState);
      }),
    );
  });
});

// --- Property 3: Onboarding flow completeness ---
// **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3**

describe('Property 3: Onboarding flow completeness', () => {
  it('after cuisine, diet, and style, onboardingComplete=true and state=main_menu with weekly plan', async () => {
    // Use fixed preferences matching test data since plan is now built during onboarding
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mockMealRepo, mockMealComponentRepo);
    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' },
      r3.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r4.updatedState.onboardingComplete).toBe(true);
    expect(r4.updatedState.conversationState).toBe('main_menu');
    expect(r4.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r4.updatedState.weeklyPlan).toBeDefined();
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
          mockMealComponentRepo,
        );

        if (intentType === Intent.SAVE_COOK_NUMBER) {
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
        const result = await processIntent({ intent: Intent.UNKNOWN }, state, mockMealRepo, mockMealComponentRepo);
        expect(result.response.type).not.toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
        expect(result.response.type).not.toBe(ResponseType.ONBOARDING_DIET_PROMPT);
        expect(result.response.type).not.toBe(ResponseType.ONBOARDING_STYLE_PROMPT);
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
    // Use fixed preferences matching test data since plan is now built during onboarding
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mockMealRepo, mockMealComponentRepo);
    expect(r1.response.suggestedActions).toBeDefined();
    expect(r1.response.suggestedActions!.length).toBeGreaterThan(0);

    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r2.response.suggestedActions).toBeDefined();
    expect(r2.response.suggestedActions!.length).toBeGreaterThan(0);

    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r3.response.suggestedActions).toBeDefined();
    expect(r3.response.suggestedActions!.length).toBeGreaterThan(0);

    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' },
      r3.updatedState, mockMealRepo, mockMealComponentRepo,
    );
    expect(r4.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r4.response.suggestedActions).toBeDefined();
    expect(r4.response.suggestedActions!.length).toBeGreaterThan(0);
  });

  it('main menu GENERATE_PLAN response shows existing plan when available', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.GENERATE_PLAN }, state, mockMealRepo, mockMealComponentRepo);
    expect(result.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(result.response.data?.weeklyPlan).toBeDefined();
  });

  it('main menu INVALID_INPUT response has non-empty suggestedActions', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, mockMealRepo, mockMealComponentRepo);
    expect(result.response.suggestedActions).toBeDefined();
    expect(result.response.suggestedActions!.length).toBeGreaterThan(0);
  });
});
