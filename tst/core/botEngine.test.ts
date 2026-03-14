import { describe, it, expect, vi } from 'vitest';
import {
  processIntent,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  STYLE_OPTIONS,
  MAIN_MENU_OPTIONS,
  getComingMondayISO,
} from '../../src/core/botEngine';
import { Intent, ResponseType, type UserState, type UserIntent, type Meal } from '../../src/core/types';
import type { MealRepository } from '../../src/core/ports';

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

// Enough meals per slot to fill 7 days without repeats
const TEST_MEALS: Meal[] = [
  // 8 breakfast meals
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `b-${i}`, name: `Breakfast ${i}`, slots: ['breakfast'] })
  ),
  // 8 lunch meals
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `l-${i}`, name: `Lunch ${i}`, slots: ['lunch'] })
  ),
  // 8 dinner meals
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `d-${i}`, name: `Dinner ${i}`, slots: ['dinner'] })
  ),
];

// Mock MealRepository that returns test meals
const mockMealRepo: MealRepository = {
  getMeals: async () => TEST_MEALS,
  getMealById: async (id) => TEST_MEALS.find((m) => m.id === id) ?? null,
};

// Stub MealRepository — not used during onboarding
const stubMealRepo: MealRepository = {
  getMeals: async () => [],
  getMealById: async () => null,
};

function makeState(overrides: Partial<UserState> = {}): UserState {
  return {
    phoneNumber: '+919999999999',
    onboardingComplete: false,
    conversationState: 'awaiting_cuisine',
    ...overrides,
  };
}

function makeMainMenuState(overrides: Partial<UserState> = {}): UserState {
  return makeState({
    onboardingComplete: true,
    conversationState: 'main_menu',
    cuisinePreference: 'north_indian',
    dietPreference: 'veg',
    mealStyle: 'health',
    ...overrides,
  });
}

describe('BotEngine — onboarding flow', () => {
  it('returns ONBOARDING_CUISINE_PROMPT for a new user (null state)', async () => {
    const intent: UserIntent = { intent: Intent.UNKNOWN };
    const result = await processIntent(intent, null, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
    expect(result.response.suggestedActions).toEqual(CUISINE_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_cuisine');
    expect(result.updatedState.onboardingComplete).toBe(false);
  });

  it('stores cuisine and transitions to awaiting_diet on SELECT_CUISINE', async () => {
    const state = makeState({ conversationState: 'awaiting_cuisine' });
    const intent: UserIntent = { intent: Intent.SELECT_CUISINE, payload: 'north_indian' };
    const result = await processIntent(intent, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);
    expect(result.response.suggestedActions).toEqual(DIET_OPTIONS);
    expect(result.updatedState.cuisinePreference).toBe('north_indian');
    expect(result.updatedState.conversationState).toBe('awaiting_diet');
  });

  it('stores "both" cuisine preference correctly', async () => {
    const state = makeState({ conversationState: 'awaiting_cuisine' });
    const intent: UserIntent = { intent: Intent.SELECT_CUISINE, payload: 'both' };
    const result = await processIntent(intent, state, stubMealRepo);

    expect(result.updatedState.cuisinePreference).toBe('both');
    expect(result.updatedState.conversationState).toBe('awaiting_diet');
  });

  it('stores diet and transitions to awaiting_meal_style on SELECT_DIET', async () => {
    const state = makeState({
      conversationState: 'awaiting_diet',
      cuisinePreference: 'south_indian',
    });
    const intent: UserIntent = { intent: Intent.SELECT_DIET, payload: 'veg' };
    const result = await processIntent(intent, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);
    expect(result.response.suggestedActions).toEqual(STYLE_OPTIONS);
    expect(result.updatedState.dietPreference).toBe('veg');
    expect(result.updatedState.conversationState).toBe('awaiting_meal_style');
  });

  it('stores meal style, marks onboarding complete, and returns MAIN_MENU', async () => {
    const state = makeState({
      conversationState: 'awaiting_meal_style',
      cuisinePreference: 'both',
      dietPreference: 'non_veg',
    });
    const intent: UserIntent = { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' };
    const result = await processIntent(intent, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.MAIN_MENU);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
    expect(result.updatedState.mealStyle).toBe('health');
    expect(result.updatedState.onboardingComplete).toBe(true);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });

  it('completes full onboarding flow end-to-end', async () => {
    // Step 1: New user
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, stubMealRepo);
    expect(r1.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);

    // Step 2: Select cuisine
    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState,
      stubMealRepo
    );
    expect(r2.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);

    // Step 3: Select diet
    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'non_veg' },
      r2.updatedState,
      stubMealRepo
    );
    expect(r3.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);

    // Step 4: Select meal style
    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' },
      r3.updatedState,
      stubMealRepo
    );
    expect(r4.response.type).toBe(ResponseType.MAIN_MENU);
    expect(r4.updatedState.onboardingComplete).toBe(true);
    expect(r4.updatedState.conversationState).toBe('main_menu');
    expect(r4.updatedState.cuisinePreference).toBe('north_indian');
    expect(r4.updatedState.dietPreference).toBe('non_veg');
    expect(r4.updatedState.mealStyle).toBe('regular');
  });
});

describe('BotEngine — invalid input during onboarding', () => {
  it('returns INVALID_INPUT with cuisine options for UNKNOWN in awaiting_cuisine', async () => {
    const state = makeState({ conversationState: 'awaiting_cuisine' });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(CUISINE_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_cuisine');
  });

  it('returns INVALID_INPUT with diet options for UNKNOWN in awaiting_diet', async () => {
    const state = makeState({ conversationState: 'awaiting_diet' });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(DIET_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_diet');
  });

  it('returns INVALID_INPUT with style options for UNKNOWN in awaiting_meal_style', async () => {
    const state = makeState({ conversationState: 'awaiting_meal_style' });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(STYLE_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_meal_style');
  });

  it('does not change state when invalid input is received', async () => {
    const state = makeState({
      conversationState: 'awaiting_cuisine',
      cuisinePreference: undefined,
    });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo);

    expect(result.updatedState).toEqual(state);
  });

  it('re-prompts with correct options when wrong intent is sent during onboarding', async () => {
    // Sending GENERATE_PLAN during awaiting_diet should be treated as unknown
    const state = makeState({ conversationState: 'awaiting_diet' });
    const result = await processIntent({ intent: Intent.GENERATE_PLAN }, state, stubMealRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(DIET_OPTIONS);
  });
});


// --- Helper to build a state with a valid weekly plan ---

function makeStateWithPlan(overrides: Partial<UserState> = {}): UserState {
  // Build a minimal valid weekly plan from TEST_MEALS
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeklyPlan = days.map((day, i) => ({
    day,
    breakfast: TEST_MEALS[i % 8],           // b-0 through b-6
    lunch: TEST_MEALS[8 + (i % 8)],         // l-0 through l-6
    dinner: TEST_MEALS[16 + (i % 8)],       // d-0 through d-6
  }));

  return makeMainMenuState({
    weeklyPlan,
    weeklyPlanStartDate: getComingMondayISO(),
    ...overrides,
  });
}

describe('BotEngine — main menu: GENERATE_PLAN', () => {
  it('generates a weekly plan and stores it in state', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.GENERATE_PLAN },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(result.response.data?.weeklyPlan).toBeDefined();
    expect(result.response.data!.weeklyPlan).toHaveLength(7);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
    expect(result.updatedState.weeklyPlan).toEqual(result.response.data!.weeklyPlan);
    expect(result.updatedState.weeklyPlanStartDate).toBeDefined();
    expect(result.updatedState.conversationState).toBe('main_menu');
  });

  it('calls mealRepository.getMeals with user preferences', async () => {
    const getMealsSpy = vi.fn().mockResolvedValue(TEST_MEALS);
    const spyRepo: MealRepository = {
      getMeals: getMealsSpy,
      getMealById: async () => null,
    };
    const state = makeMainMenuState({
      cuisinePreference: 'south_indian',
      dietPreference: 'non_veg',
      mealStyle: 'regular',
    });

    await processIntent({ intent: Intent.GENERATE_PLAN }, state, spyRepo);

    expect(getMealsSpy).toHaveBeenCalledWith({
      cuisine: 'south_indian',
      diet: 'non_veg',
      style: 'regular',
    });
  });
});

describe('BotEngine — main menu: VIEW_WEEKLY_GROCERY', () => {
  it('returns WEEKLY_GROCERY_LIST with grocery data when plan exists', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.VIEW_WEEKLY_GROCERY },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.WEEKLY_GROCERY_LIST);
    expect(result.response.data?.groceryList).toBeDefined();
    expect(result.response.data!.groceryList!.length).toBeGreaterThan(0);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
  });

  it('returns NO_PLAN_ERROR when no plan exists', async () => {
    const state = makeMainMenuState({ weeklyPlan: undefined });
    const result = await processIntent(
      { intent: Intent.VIEW_WEEKLY_GROCERY },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
  });
});

describe('BotEngine — main menu: VIEW_TOMORROW_PLAN', () => {
  it('returns TOMORROW_PLAN with day plan data when plan covers tomorrow', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_PLAN },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.TOMORROW_PLAN);
    expect(result.response.data?.dayPlan).toBeDefined();
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
  });

  it('returns NO_PLAN_ERROR when no plan exists', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_PLAN },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });

  it('returns NO_PLAN_ERROR when plan is expired (old start date)', async () => {
    const state = makeStateWithPlan({ weeklyPlanStartDate: '2020-01-06' });
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_PLAN },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });
});

describe('BotEngine — main menu: VIEW_TOMORROW_GROCERY', () => {
  it('returns TOMORROW_GROCERY_LIST when plan covers tomorrow', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_GROCERY },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.TOMORROW_GROCERY_LIST);
    expect(result.response.data?.groceryList).toBeDefined();
    expect(result.response.data!.groceryList!.length).toBeGreaterThan(0);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
  });

  it('returns NO_PLAN_ERROR when no plan exists', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_GROCERY },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });

  it('returns NO_PLAN_ERROR when plan is expired', async () => {
    const state = makeStateWithPlan({ weeklyPlanStartDate: '2020-01-06' });
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_GROCERY },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });
});

describe('BotEngine — main menu: SEND_MENU_TO_COOK', () => {
  it('returns COOK_MESSAGE_SENT with dayPlan and cookNumber when all data exists', async () => {
    const state = makeStateWithPlan({ cookPhoneNumber: '+911234567890' });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.COOK_MESSAGE_SENT);
    expect(result.response.data?.dayPlan).toBeDefined();
    expect(result.response.data?.cookNumber).toBe('+911234567890');
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
  });

  it('returns NO_PLAN_ERROR when no plan exists', async () => {
    const state = makeMainMenuState({ cookPhoneNumber: '+911234567890' });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });

  it('returns NO_COOK_ERROR when no cook number is saved', async () => {
    const state = makeStateWithPlan({ cookPhoneNumber: undefined });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_COOK_ERROR);
  });

  it('returns NO_PLAN_ERROR when plan is expired', async () => {
    const state = makeStateWithPlan({
      cookPhoneNumber: '+911234567890',
      weeklyPlanStartDate: '2020-01-06',
    });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });
});

describe('BotEngine — main menu: SWAP_LUNCH', () => {
  it('returns SWAP_CONFIRMATION with old/new meal when swap succeeds', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.SWAP_LUNCH },
      state,
      mockMealRepo,
    );

    // Swap may succeed or return SWAP_NO_ALTERNATIVE depending on tomorrow index
    if (result.response.type === ResponseType.SWAP_CONFIRMATION) {
      expect(result.response.data?.oldMeal).toBeDefined();
      expect(result.response.data?.newMeal).toBeDefined();
      expect(result.updatedState.weeklyPlan).toBeDefined();
      expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
      expect(result.updatedState.conversationState).toBe('main_menu');
    } else {
      // If tomorrow is outside the plan range, we get SWAP_NO_ALTERNATIVE
      expect(result.response.type).toBe(ResponseType.SWAP_NO_ALTERNATIVE);
    }
  });

  it('returns NO_PLAN_ERROR when no plan exists', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.SWAP_LUNCH },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });
});

describe('BotEngine — main menu: SAVE_COOK_NUMBER', () => {
  it('transitions to awaiting_cook_number and returns COOK_NUMBER_PROMPT', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.SAVE_COOK_NUMBER },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.COOK_NUMBER_PROMPT);
    expect(result.updatedState.conversationState).toBe('awaiting_cook_number');
  });
});

describe('BotEngine — main menu: UNKNOWN intent', () => {
  it('returns INVALID_INPUT with main menu options', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.UNKNOWN },
      state,
      mockMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });
});

describe('BotEngine — main menu: state remains main_menu after actions', () => {
  it('state is main_menu after GENERATE_PLAN', async () => {
    const state = makeMainMenuState();
    const result = await processIntent({ intent: Intent.GENERATE_PLAN }, state, mockMealRepo);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });

  it('state is main_menu after VIEW_WEEKLY_GROCERY', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.VIEW_WEEKLY_GROCERY }, state, mockMealRepo);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });

  it('state is main_menu after VIEW_TOMORROW_PLAN', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.VIEW_TOMORROW_PLAN }, state, mockMealRepo);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });
});


// --- Cook number flow tests ---

function makeAwaitingCookState(overrides: Partial<UserState> = {}): UserState {
  return makeMainMenuState({
    conversationState: 'awaiting_cook_number',
    ...overrides,
  });
}

describe('BotEngine — awaiting_cook_number: PROVIDE_COOK_NUMBER', () => {
  it('saves a valid phone number and returns COOK_NUMBER_SAVED', async () => {
    const state = makeAwaitingCookState();
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: '+911234567890' },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.COOK_NUMBER_SAVED);
    expect(result.response.data?.cookNumber).toBe('+911234567890');
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
    expect(result.updatedState.cookPhoneNumber).toBe('+911234567890');
    expect(result.updatedState.conversationState).toBe('main_menu');
  });

  it('returns INVALID_PHONE for an invalid phone number', async () => {
    const state = makeAwaitingCookState();
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: 'not-a-number' },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_PHONE);
    expect(result.updatedState.conversationState).toBe('awaiting_cook_number');
    expect(result.updatedState.cookPhoneNumber).toBeUndefined();
  });

  it('returns INVALID_PHONE for a phone number missing country code', async () => {
    const state = makeAwaitingCookState();
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: '9876543210' },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_PHONE);
    expect(result.updatedState.conversationState).toBe('awaiting_cook_number');
  });

  it('returns INVALID_PHONE for a phone number that is too short', async () => {
    const state = makeAwaitingCookState();
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: '+123' },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_PHONE);
    expect(result.updatedState.conversationState).toBe('awaiting_cook_number');
  });

  it('returns INVALID_INPUT for UNKNOWN intent in awaiting_cook_number', async () => {
    const state = makeAwaitingCookState();
    const result = await processIntent(
      { intent: Intent.UNKNOWN },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.updatedState.conversationState).toBe('awaiting_cook_number');
  });

  it('does not change state on invalid phone input', async () => {
    const state = makeAwaitingCookState({ cookPhoneNumber: '+910000000000' });
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: 'abc' },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_PHONE);
    // Existing cook number should remain unchanged
    expect(result.updatedState.cookPhoneNumber).toBe('+910000000000');
  });

  it('overwrites an existing cook number with a new valid one', async () => {
    const state = makeAwaitingCookState({ cookPhoneNumber: '+910000000000' });
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: '+919999999999' },
      state,
      stubMealRepo,
    );

    expect(result.response.type).toBe(ResponseType.COOK_NUMBER_SAVED);
    expect(result.updatedState.cookPhoneNumber).toBe('+919999999999');
    expect(result.updatedState.conversationState).toBe('main_menu');
  });
});
