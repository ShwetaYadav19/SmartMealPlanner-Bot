import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { DynamoDBUserStateRepository } from '../../src/adapters/dynamodbUserStateRepository';
import type { UserState, Meal, DayPlan, WeeklyPlan, ConversationState, Ingredient } from '../../src/core/types';

/**
 * Property 16: User state persistence round-trip
 * Validates: Requirements 14.2, 4.7, 10.3
 *
 * Generate random valid UserState objects, save to DynamoDB (mock),
 * load by phone number, verify equivalence.
 */

// --- Arbitraries ---

const arbIngredient: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  quantity: fc.string({ minLength: 1, maxLength: 20 }),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'lentils', 'nuts', 'oils'),
});

const arbMeal: fc.Arbitrary<Meal> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  cuisine: fc.constantFrom('north_indian' as const, 'south_indian' as const),
  diet: fc.constantFrom('veg' as const, 'non_veg' as const),
  style: fc.constantFrom('health' as const, 'regular' as const),
  slots: fc.subarray(['breakfast' as const, 'lunch' as const, 'dinner' as const], { minLength: 1 }),
  ingredients: fc.array(arbIngredient, { minLength: 1, maxLength: 5 }),
});

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const arbDayPlan = (day: string): fc.Arbitrary<DayPlan> =>
  fc.record({
    day: fc.constant(day),
    breakfast: arbMeal,
    lunch: arbMeal,
    dinner: arbMeal,
  });

const arbWeeklyPlan: fc.Arbitrary<WeeklyPlan> = fc.tuple(
  ...DAYS.map((d) => arbDayPlan(d))
).map((days) => days as DayPlan[]);

const arbConversationState: fc.Arbitrary<ConversationState> = fc.constantFrom(
  'awaiting_cuisine',
  'awaiting_diet',
  'awaiting_meal_style',
  'main_menu',
  'awaiting_cook_number'
);

const arbPhoneNumber = fc
  .tuple(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 1000000000, max: 9999999999 }))
  .map(([cc, num]) => `+${cc}${num}`);

const arbUserState: fc.Arbitrary<UserState> = fc.record(
  {
    phoneNumber: arbPhoneNumber,
    onboardingComplete: fc.boolean(),
    conversationState: arbConversationState,
    cuisinePreference: fc.constantFrom('north_indian' as const, 'south_indian' as const, 'both' as const),
    dietPreference: fc.constantFrom('veg' as const, 'non_veg' as const),
    mealStyle: fc.constantFrom('health' as const, 'regular' as const),
    weeklyPlan: arbWeeklyPlan,
    weeklyPlanStartDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }).map(
      (d) => d.toISOString().split('T')[0]
    ),
    cookPhoneNumber: arbPhoneNumber,
  },
  { requiredKeys: ['phoneNumber', 'onboardingComplete', 'conversationState'] }
);

// --- Mock DynamoDB client ---

function createMockDocClient() {
  const store = new Map<string, Record<string, unknown>>();

  return {
    store,
    send: vi.fn(async (command: any) => {
      const input = command.input;
      if (input.Item) {
        // PutCommand — store the item
        store.set(input.Item.phoneNumber as string, structuredClone(input.Item));
        return {};
      }
      // GetCommand — retrieve the item
      const item = store.get(input.Key.phoneNumber as string);
      return { Item: item ? structuredClone(item) : undefined };
    }),
  };
}

// --- Tests ---

describe('Property 16: User state persistence round-trip', () => {
  let mockDocClient: ReturnType<typeof createMockDocClient>;
  let repo: DynamoDBUserStateRepository;

  beforeEach(() => {
    mockDocClient = createMockDocClient();
    repo = new DynamoDBUserStateRepository('MealPlannerUsers-test', mockDocClient as any);
  });

  /**
   * **Validates: Requirements 14.2, 4.7, 10.3**
   */
  it('save then get returns an equivalent UserState for any valid state', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserState, async (state) => {
        // Reset store between iterations
        mockDocClient.store.clear();

        await repo.saveUser(state);
        const loaded = await repo.getUser(state.phoneNumber);

        expect(loaded).not.toBeNull();
        expect(loaded!.phoneNumber).toBe(state.phoneNumber);
        expect(loaded!.onboardingComplete).toBe(state.onboardingComplete);
        expect(loaded!.conversationState).toBe(state.conversationState);

        // Optional fields: present in loaded iff present in original
        if (state.cuisinePreference !== undefined) {
          expect(loaded!.cuisinePreference).toBe(state.cuisinePreference);
        } else {
          expect(loaded!.cuisinePreference).toBeUndefined();
        }

        if (state.dietPreference !== undefined) {
          expect(loaded!.dietPreference).toBe(state.dietPreference);
        } else {
          expect(loaded!.dietPreference).toBeUndefined();
        }

        if (state.mealStyle !== undefined) {
          expect(loaded!.mealStyle).toBe(state.mealStyle);
        } else {
          expect(loaded!.mealStyle).toBeUndefined();
        }

        if (state.weeklyPlan !== undefined) {
          expect(loaded!.weeklyPlan).toEqual(state.weeklyPlan);
        } else {
          expect(loaded!.weeklyPlan).toBeUndefined();
        }

        if (state.weeklyPlanStartDate !== undefined) {
          expect(loaded!.weeklyPlanStartDate).toBe(state.weeklyPlanStartDate);
        } else {
          expect(loaded!.weeklyPlanStartDate).toBeUndefined();
        }

        if (state.cookPhoneNumber !== undefined) {
          expect(loaded!.cookPhoneNumber).toBe(state.cookPhoneNumber);
        } else {
          expect(loaded!.cookPhoneNumber).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});
