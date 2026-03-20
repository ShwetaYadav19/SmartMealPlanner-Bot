import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamoDBUserStateRepository } from '../../src/adapters/dynamodbUserStateRepository';
import type {
  UserState,
  Meal,
  ComposedMeal,
  MealComponent,
  DayPlan,
  WeeklyPlan,
  Ingredient,
} from '../../src/core/types';

/**
 * Round-trip test for new UserState fields added in the smart-meal-planner-workflow spec:
 * fewMealsSelectedDay, fewMealsSelectedSlot, fewMealsAlternatives, previousWeeklyPlan
 */

// --- Helpers ---

function createMockDocClient() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    send: vi.fn(async (command: any) => {
      const input = command.input;
      if (input.Item) {
        store.set(input.Item.phoneNumber as string, structuredClone(input.Item));
        return {};
      }
      const item = store.get(input.Key.phoneNumber as string);
      return { Item: item ? structuredClone(item) : undefined };
    }),
  };
}

const ingredient: Ingredient = { name: 'Rice', quantity: '200g', category: 'grains' };

const sampleMeal: Meal = {
  id: 'meal-001',
  name: 'Poha',
  cuisine: ['north_indian'],
  diet: 'veg',
  style: 'health',
  slots: ['breakfast'],
  ingredients: [ingredient],
};

const sampleComponent: MealComponent = {
  id: 'comp-001',
  name: 'Jeera Rice',
  category: 'base',
  cuisine: ['north_indian'],
  diet: 'veg',
  style: 'health',
  slots: ['lunch'],
  ingredients: [ingredient],
};

const sampleComposedMeal: ComposedMeal = {
  components: [
    { ...sampleComponent, id: 'base-1', name: 'Jeera Rice', category: 'base' },
    { ...sampleComponent, id: 'gravy-1', name: 'Dal Tadka', category: 'gravy' },
    { ...sampleComponent, id: 'dry-1', name: 'Aloo Gobi', category: 'dry_veggie' },
    { ...sampleComponent, id: 'side-1', name: 'Raita', category: 'side' },
  ],
  name: 'Jeera Rice, Dal Tadka, Aloo Gobi, Raita',
  ingredients: [ingredient],
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function buildWeeklyPlan(): WeeklyPlan {
  return DAYS.map((day) => ({
    day,
    breakfast: { ...sampleMeal, id: `b-${day}`, name: `Breakfast ${day}` },
    lunch: {
      ...sampleComposedMeal,
      name: `Lunch ${day}`,
    },
    dinner: {
      ...sampleComposedMeal,
      name: `Dinner ${day}`,
    },
  }));
}

// --- Tests ---

describe('DynamoDB adapter round-trip for new UserState fields', () => {
  let mockDocClient: ReturnType<typeof createMockDocClient>;
  let repo: DynamoDBUserStateRepository;

  beforeEach(() => {
    mockDocClient = createMockDocClient();
    repo = new DynamoDBUserStateRepository('MealPlannerUsers-test', mockDocClient as any);
  });

  it('round-trips fewMealsSelectedDay', async () => {
    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'few_meals_day_select',
      fewMealsSelectedDay: 3,
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.fewMealsSelectedDay).toBe(3);
  });

  it('round-trips fewMealsSelectedSlot', async () => {
    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'few_meals_slot_select',
      fewMealsSelectedSlot: 'dinner',
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.fewMealsSelectedSlot).toBe('dinner');
  });

  it('round-trips fewMealsAlternatives with Meal items', async () => {
    const alternatives: Meal[] = [
      { ...sampleMeal, id: 'alt-1', name: 'Upma' },
      { ...sampleMeal, id: 'alt-2', name: 'Idli' },
      { ...sampleMeal, id: 'alt-3', name: 'Dosa' },
    ];

    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'few_meals_alternatives',
      fewMealsAlternatives: alternatives,
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.fewMealsAlternatives).toEqual(alternatives);
    expect(loaded!.fewMealsAlternatives).toHaveLength(3);
  });

  it('round-trips fewMealsAlternatives with ComposedMeal items', async () => {
    const alternatives: ComposedMeal[] = [
      { ...sampleComposedMeal, name: 'Alt Lunch 1' },
      { ...sampleComposedMeal, name: 'Alt Lunch 2' },
    ];

    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'few_meals_alternatives',
      fewMealsAlternatives: alternatives,
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.fewMealsAlternatives).toEqual(alternatives);
  });

  it('round-trips previousWeeklyPlan', async () => {
    const previousPlan = buildWeeklyPlan();

    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'entire_plan_confirm',
      previousWeeklyPlan: previousPlan,
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.previousWeeklyPlan).toEqual(previousPlan);
    expect(loaded!.previousWeeklyPlan).toHaveLength(7);
  });

  it('round-trips all new fields together', async () => {
    const weeklyPlan = buildWeeklyPlan();
    const previousPlan = buildWeeklyPlan();
    const alternatives: (Meal | ComposedMeal)[] = [
      { ...sampleMeal, id: 'alt-1', name: 'Upma' },
      { ...sampleComposedMeal, name: 'Alt Composed' },
    ];

    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'few_meals_alternatives',
      cuisinePreference: 'north_indian',
      dietPreference: 'veg',
      mealStyle: 'health',
      weeklyPlan,
      weeklyPlanStartDate: '2024-06-10',
      fewMealsSelectedDay: 5,
      fewMealsSelectedSlot: 'lunch',
      fewMealsAlternatives: alternatives,
      previousWeeklyPlan: previousPlan,
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.fewMealsSelectedDay).toBe(5);
    expect(loaded!.fewMealsSelectedSlot).toBe('lunch');
    expect(loaded!.fewMealsAlternatives).toEqual(alternatives);
    expect(loaded!.previousWeeklyPlan).toEqual(previousPlan);
    // Existing fields still preserved
    expect(loaded!.weeklyPlan).toEqual(weeklyPlan);
    expect(loaded!.cuisinePreference).toBe('north_indian');
  });

  it('omits new fields when undefined', async () => {
    const state: UserState = {
      phoneNumber: '+919876543210',
      onboardingComplete: false,
      conversationState: 'awaiting_cuisine',
    };

    await repo.saveUser(state);
    const loaded = await repo.getUser(state.phoneNumber);

    expect(loaded).not.toBeNull();
    expect(loaded!.fewMealsSelectedDay).toBeUndefined();
    expect(loaded!.fewMealsSelectedSlot).toBeUndefined();
    expect(loaded!.fewMealsAlternatives).toBeUndefined();
    expect(loaded!.previousWeeklyPlan).toBeUndefined();
  });

  it('round-trips fewMealsSelectedDay boundary values (0 and 6)', async () => {
    for (const day of [0, 6]) {
      const state: UserState = {
        phoneNumber: `+91987654321${day}`,
        onboardingComplete: true,
        conversationState: 'few_meals_day_select',
        fewMealsSelectedDay: day,
      };

      await repo.saveUser(state);
      const loaded = await repo.getUser(state.phoneNumber);

      expect(loaded!.fewMealsSelectedDay).toBe(day);
    }
  });

  it('round-trips all slot values for fewMealsSelectedSlot', async () => {
    for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
      const state: UserState = {
        phoneNumber: `+91987654${slot.length}210`,
        onboardingComplete: true,
        conversationState: 'few_meals_slot_select',
        fewMealsSelectedSlot: slot,
      };

      await repo.saveUser(state);
      const loaded = await repo.getUser(state.phoneNumber);

      expect(loaded!.fewMealsSelectedSlot).toBe(slot);
    }
  });
});
