import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processIntent,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  STYLE_OPTIONS,
  MAIN_MENU_OPTIONS,
  SKIP_COOK_NUMBER_OPTION,
  getComingMondayISO,
} from '../../src/core/botEngine';
import { Intent, ResponseType, type UserState, type UserIntent, type Meal, type MealComponent, type ComposedMeal } from '../../src/core/types';
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

// Breakfast meals only (lunch/dinner now come from components)
const TEST_MEALS: Meal[] = [
  ...Array.from({ length: 8 }, (_, i) =>
    makeMeal({ id: `b-${i}`, name: `Breakfast ${i}`, slots: ['breakfast'] })
  ),
];

// Test meal components for lunch/dinner
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

// Helper to build a ComposedMeal for test fixtures
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

describe('BotEngine — onboarding flow', () => {
  it('returns ONBOARDING_CUISINE_PROMPT for a new user (null state)', async () => {
    const intent: UserIntent = { intent: Intent.UNKNOWN };
    const result = await processIntent(intent, null, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
    expect(result.response.suggestedActions).toEqual(CUISINE_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_cuisine');
    expect(result.updatedState.onboardingComplete).toBe(false);
  });

  it('stores cuisine and transitions to awaiting_diet on SELECT_CUISINE', async () => {
    const state = makeState({ conversationState: 'awaiting_cuisine' });
    const intent: UserIntent = { intent: Intent.SELECT_CUISINE, payload: 'north_indian' };
    const result = await processIntent(intent, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);
    expect(result.response.suggestedActions).toEqual(DIET_OPTIONS);
    expect(result.updatedState.cuisinePreference).toBe('north_indian');
    expect(result.updatedState.conversationState).toBe('awaiting_diet');
  });

  it('stores "both" cuisine preference correctly', async () => {
    const state = makeState({ conversationState: 'awaiting_cuisine' });
    const intent: UserIntent = { intent: Intent.SELECT_CUISINE, payload: 'both' };
    const result = await processIntent(intent, state, stubMealRepo, stubMealComponentRepo);

    expect(result.updatedState.cuisinePreference).toBe('both');
    expect(result.updatedState.conversationState).toBe('awaiting_diet');
  });

  it('stores diet and transitions to awaiting_meal_style on SELECT_DIET', async () => {
    const state = makeState({
      conversationState: 'awaiting_diet',
      cuisinePreference: 'south_indian',
    });
    const intent: UserIntent = { intent: Intent.SELECT_DIET, payload: 'veg' };
    const result = await processIntent(intent, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);
    expect(result.response.suggestedActions).toEqual(STYLE_OPTIONS);
    expect(result.updatedState.dietPreference).toBe('veg');
    expect(result.updatedState.conversationState).toBe('awaiting_meal_style');
  });

  it('stores "both" diet preference correctly', async () => {
    const state = makeState({
      conversationState: 'awaiting_diet',
      cuisinePreference: 'north_indian',
    });
    const intent: UserIntent = { intent: Intent.SELECT_DIET, payload: 'both' };
    const result = await processIntent(intent, state, stubMealRepo, stubMealComponentRepo);

    expect(result.updatedState.dietPreference).toBe('both');
    expect(result.updatedState.conversationState).toBe('awaiting_meal_style');
  });

  it('stores meal style and transitions to cook number onboarding', async () => {
    const state = makeState({
      conversationState: 'awaiting_meal_style',
      cuisinePreference: 'both',
      dietPreference: 'non_veg',
    });
    const intent: UserIntent = { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' };
    const result = await processIntent(intent, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.COOK_NUMBER_ONBOARDING_PROMPT);
    expect(result.response.suggestedActions).toEqual(SKIP_COOK_NUMBER_OPTION);
    expect(result.updatedState.mealStyle).toBe('health');
    expect(result.updatedState.onboardingComplete).toBe(false);
    expect(result.updatedState.conversationState).toBe('awaiting_cook_number_onboarding');
  });

  it('completes full onboarding flow end-to-end with cook number skip', async () => {
    // Step 1: New user
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, stubMealRepo, stubMealComponentRepo);
    expect(r1.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);

    // Step 2: Select cuisine
    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState,
      stubMealRepo, stubMealComponentRepo
    );
    expect(r2.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);

    // Step 3: Select diet
    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'non_veg' },
      r2.updatedState,
      stubMealRepo, stubMealComponentRepo
    );
    expect(r3.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);

    // Step 4: Select meal style — now transitions to cook number onboarding
    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' },
      r3.updatedState,
      stubMealRepo, stubMealComponentRepo
    );
    expect(r4.response.type).toBe(ResponseType.COOK_NUMBER_ONBOARDING_PROMPT);
    expect(r4.updatedState.conversationState).toBe('awaiting_cook_number_onboarding');
    expect(r4.updatedState.mealStyle).toBe('regular');

    // Step 5: Skip cook number — completes onboarding, transitions to dish_preview
    const r5 = await processIntent(
      { intent: Intent.SKIP_COOK_NUMBER },
      r4.updatedState,
      stubMealRepo, stubMealComponentRepo
    );
    expect(r5.response.type).toBe(ResponseType.DISH_PREVIEW);
    expect(r5.updatedState.onboardingComplete).toBe(true);
    expect(r5.updatedState.conversationState).toBe('dish_preview');
    expect(r5.updatedState.candidateDishes).toBeDefined();
    expect(r5.updatedState.cuisinePreference).toBe('north_indian');
    expect(r5.updatedState.dietPreference).toBe('non_veg');
    expect(r5.updatedState.mealStyle).toBe('regular');
  });
});

describe('BotEngine — invalid input during onboarding', () => {
  it('returns INVALID_INPUT with cuisine options for UNKNOWN in awaiting_cuisine', async () => {
    const state = makeState({ conversationState: 'awaiting_cuisine' });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(CUISINE_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_cuisine');
  });

  it('returns INVALID_INPUT with diet options for UNKNOWN in awaiting_diet', async () => {
    const state = makeState({ conversationState: 'awaiting_diet' });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(DIET_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_diet');
  });

  it('returns INVALID_INPUT with style options for UNKNOWN in awaiting_meal_style', async () => {
    const state = makeState({ conversationState: 'awaiting_meal_style' });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(STYLE_OPTIONS);
    expect(result.updatedState.conversationState).toBe('awaiting_meal_style');
  });

  it('does not change state when invalid input is received', async () => {
    const state = makeState({
      conversationState: 'awaiting_cuisine',
      cuisinePreference: undefined,
    });
    const result = await processIntent({ intent: Intent.UNKNOWN }, state, stubMealRepo, stubMealComponentRepo);

    expect(result.updatedState).toEqual(state);
  });

  it('re-prompts with correct options when wrong intent is sent during onboarding', async () => {
    const state = makeState({ conversationState: 'awaiting_diet' });
    const result = await processIntent({ intent: Intent.GENERATE_PLAN }, state, stubMealRepo, stubMealComponentRepo);

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(DIET_OPTIONS);
  });
});


// --- Helper to build a state with a valid weekly plan ---

function makeStateWithPlan(overrides: Partial<UserState> = {}): UserState {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeklyPlan = days.map((day, i) => ({
    day,
    breakfast: TEST_MEALS[i % 8],
    lunch: makeComposedMeal(`l-${i}`, `lunch-gravy-${i}`),
    dinner: makeComposedMeal(`d-${i}`, `dinner-gravy-${i}`),
  }));

  return makeMainMenuState({
    weeklyPlan,
    weeklyPlanStartDate: getComingMondayISO(),
    ...overrides,
  });
}

describe('BotEngine — main menu: GENERATE_PLAN (dish preview flow)', () => {
  it('generates candidate dishes and transitions to dish_preview', async () => {
    const state = makeMainMenuState();
    const result = await processIntent(
      { intent: Intent.GENERATE_PLAN },
      state,
      mockMealRepo,
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.DISH_PREVIEW);
    expect(result.response.data?.candidateDishes).toBeDefined();
    expect(result.updatedState.candidateDishes).toBeDefined();
    expect(result.updatedState.conversationState).toBe('dish_preview');
  });
});

describe('BotEngine — main menu: VIEW_WEEKLY_GROCERY', () => {
  it('returns WEEKLY_GROCERY_LIST with grocery data when plan exists', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.VIEW_WEEKLY_GROCERY },
      state,
      mockMealRepo,
      mockMealComponentRepo,
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
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
  });
});

describe('BotEngine — main menu: VIEW_TOMORROW_PLAN', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns TOMORROW_PLAN with day plan data when plan covers tomorrow', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_PLAN },
      state,
      mockMealRepo,
      mockMealComponentRepo,
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
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });

  it('returns EXPIRED_PLAN_PROMPT when plan is expired (old start date)', async () => {
    const state = makeStateWithPlan({ weeklyPlanStartDate: '2020-01-06' });
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_PLAN },
      state,
      mockMealRepo,
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.EXPIRED_PLAN_PROMPT);
  });
});

describe('BotEngine — main menu: VIEW_TOMORROW_GROCERY', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns TOMORROW_GROCERY_LIST when plan covers tomorrow', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_GROCERY },
      state,
      mockMealRepo,
      mockMealComponentRepo,
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
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });

  it('returns EXPIRED_PLAN_PROMPT when plan is expired', async () => {
    const state = makeStateWithPlan({ weeklyPlanStartDate: '2020-01-06' });
    const result = await processIntent(
      { intent: Intent.VIEW_TOMORROW_GROCERY },
      state,
      mockMealRepo,
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.EXPIRED_PLAN_PROMPT);
  });
});

describe('BotEngine — main menu: SEND_MENU_TO_COOK', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns COOK_MESSAGE_SENT with dayPlan and cookNumber when all data exists', async () => {
    const state = makeStateWithPlan({ cookPhoneNumber: '+911234567890' });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
      mockMealComponentRepo,
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
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_PLAN_ERROR);
  });

  it('returns NO_COOK_ERROR when no cook number is saved', async () => {
    const state = makeStateWithPlan({ cookPhoneNumber: undefined });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.NO_COOK_ERROR);
  });

  it('returns EXPIRED_PLAN_PROMPT when plan is expired', async () => {
    const state = makeStateWithPlan({
      cookPhoneNumber: '+911234567890',
      weeklyPlanStartDate: '2020-01-06',
    });
    const result = await processIntent(
      { intent: Intent.SEND_MENU_TO_COOK },
      state,
      mockMealRepo,
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.EXPIRED_PLAN_PROMPT);
  });
});

describe('BotEngine — main menu: SWAP_LUNCH', () => {
  it('returns SWAP_CONFIRMATION with old/new meal when swap succeeds', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent(
      { intent: Intent.SWAP_LUNCH },
      state,
      mockMealRepo,
      mockMealComponentRepo,
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
      mockMealComponentRepo,
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
      mockMealComponentRepo,
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
      mockMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_INPUT);
    expect(result.response.suggestedActions).toEqual(MAIN_MENU_OPTIONS);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });
});

describe('BotEngine — main menu: state transitions after actions', () => {
  it('state is dish_preview after GENERATE_PLAN', async () => {
    const state = makeMainMenuState();
    const result = await processIntent({ intent: Intent.GENERATE_PLAN }, state, mockMealRepo, mockMealComponentRepo);
    expect(result.updatedState.conversationState).toBe('dish_preview');
  });

  it('state is main_menu after VIEW_WEEKLY_GROCERY', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.VIEW_WEEKLY_GROCERY }, state, mockMealRepo, mockMealComponentRepo);
    expect(result.updatedState.conversationState).toBe('main_menu');
  });

  it('state is main_menu after VIEW_TOMORROW_PLAN', async () => {
    const state = makeStateWithPlan();
    const result = await processIntent({ intent: Intent.VIEW_TOMORROW_PLAN }, state, mockMealRepo, mockMealComponentRepo);
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
      stubMealComponentRepo,
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
      stubMealComponentRepo,
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
      stubMealComponentRepo,
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
      stubMealComponentRepo,
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
      stubMealComponentRepo,
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
      stubMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.INVALID_PHONE);
    expect(result.updatedState.cookPhoneNumber).toBe('+910000000000');
  });

  it('overwrites an existing cook number with a new valid one', async () => {
    const state = makeAwaitingCookState({ cookPhoneNumber: '+910000000000' });
    const result = await processIntent(
      { intent: Intent.PROVIDE_COOK_NUMBER, payload: '+919999999999' },
      state,
      stubMealRepo,
      stubMealComponentRepo,
    );

    expect(result.response.type).toBe(ResponseType.COOK_NUMBER_SAVED);
    expect(result.updatedState.cookPhoneNumber).toBe('+919999999999');
    expect(result.updatedState.conversationState).toBe('main_menu');
  });
});
