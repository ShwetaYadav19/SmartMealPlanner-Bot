import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DynamoDBUserStateRepository } from '../../src/adapters/dynamodbUserStateRepository';
import type {
  UserState,
  Meal,
  ComposedMeal,
  MealComponent,
  WeeklyPlan,
  Ingredient,
  ConversationState,
  ComponentCategory,
  PreviewStep,
} from '../../src/core/types';

// --- Mock DynamoDB client ---

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

// --- Arbitraries ---

const phoneArb = fc.stringMatching(/^\+91[0-9]{10}$/);

const conversationStateArb: fc.Arbitrary<ConversationState> = fc.constantFrom(
  'awaiting_cuisine',
  'awaiting_diet',
  'awaiting_meal_style',
  'awaiting_cook_number_onboarding',
  'dish_preview',
  'main_menu',
  'awaiting_cook_number',
  'awaiting_preference_cuisine',
  'awaiting_preference_diet',
  'change_plan_menu',
  'few_meals_day_select',
  'few_meals_slot_select',
  'few_meals_alternatives',
  'entire_plan_confirm',
);

const ingredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc.stringMatching(/^[a-z]{2,10}$/),
  quantity: fc.stringMatching(/^[0-9]{1,3}[a-z]{1,3}$/),
  category: fc.constantFrom('vegetables', 'dairy', 'spices', 'grains', 'protein'),
});

const cuisineArrayArb = fc.constantFrom<('north_indian' | 'south_indian')[]>(
  ['north_indian'],
  ['south_indian'],
  ['north_indian', 'south_indian'],
);

const dietArb = fc.constantFrom<'veg' | 'non_veg'>('veg', 'non_veg');
const styleArb = fc.constantFrom<'health' | 'regular'>('health', 'regular');

const mealArb: fc.Arbitrary<Meal> = fc.record({
  id: fc.stringMatching(/^m[0-9]{1,4}$/),
  name: fc.stringMatching(/^[a-z]{2,12}$/),
  cuisine: cuisineArrayArb,
  diet: dietArb,
  style: styleArb,
  slots: fc.subarray(['breakfast' as const, 'lunch' as const, 'dinner' as const], { minLength: 1 }),
  ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 3 }),
});

const componentCategoryArb: fc.Arbitrary<ComponentCategory> = fc.constantFrom('base', 'gravy', 'dry_veggie', 'side');

const mealComponentArb: fc.Arbitrary<MealComponent> = fc.record({
  id: fc.stringMatching(/^c[0-9]{1,4}$/),
  name: fc.stringMatching(/^[a-z]{2,12}$/),
  category: componentCategoryArb,
  cuisine: cuisineArrayArb,
  diet: dietArb,
  style: styleArb,
  slots: fc.subarray(['lunch' as const, 'dinner' as const], { minLength: 1 }),
  ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 3 }),
});

const composedMealArb: fc.Arbitrary<ComposedMeal> = fc
  .tuple(
    mealComponentArb.map((c) => ({ ...c, category: 'base' as const })),
    mealComponentArb.map((c) => ({ ...c, category: 'gravy' as const })),
    mealComponentArb.map((c) => ({ ...c, category: 'dry_veggie' as const })),
    mealComponentArb.map((c) => ({ ...c, category: 'side' as const })),
  )
  .map(([base, gravy, dry, side]) => {
    const components = [base, gravy, dry, side];
    return {
      components,
      name: components.map((c) => c.name).join(', '),
      ingredients: components.flatMap((c) => c.ingredients),
    };
  });

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const dayPlanArb = (dayName: string) =>
  fc.tuple(mealArb, composedMealArb, composedMealArb).map(([breakfast, lunch, dinner]) => ({
    day: dayName,
    breakfast,
    lunch,
    dinner,
  }));

const weeklyPlanArb: fc.Arbitrary<WeeklyPlan> = fc
  .tuple(...(DAYS.map((d) => dayPlanArb(d)) as [fc.Arbitrary<any>, fc.Arbitrary<any>, fc.Arbitrary<any>, fc.Arbitrary<any>, fc.Arbitrary<any>, fc.Arbitrary<any>, fc.Arbitrary<any>]))
  .map((plans) => plans as WeeklyPlan);

const slotArb = fc.constantFrom<'breakfast' | 'lunch' | 'dinner'>('breakfast', 'lunch', 'dinner');

const alternativesArb: fc.Arbitrary<(Meal | ComposedMeal)[]> = fc.array(
  fc.oneof(mealArb, composedMealArb),
  { minLength: 1, maxLength: 3 },
);

const cuisinePrefArb = fc.constantFrom<'north_indian' | 'south_indian' | 'both'>('north_indian', 'south_indian', 'both');
const dietPrefArb = fc.constantFrom<'veg' | 'non_veg' | 'both'>('veg', 'non_veg', 'both');
const previewStepArb: fc.Arbitrary<PreviewStep> = fc.constantFrom('breakfast', 'base', 'gravy', 'dry_veggie', 'side', 'confirm');

const isoDateArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }).map(
  (d) => d.toISOString().slice(0, 10),
);

// Build a full UserState arbitrary with all optional fields
const userStateArb: fc.Arbitrary<UserState> = fc.record(
  {
    phoneNumber: phoneArb,
    onboardingComplete: fc.boolean(),
    conversationState: conversationStateArb,
    cuisinePreference: cuisinePrefArb,
    dietPreference: dietPrefArb,
    mealStyle: styleArb,
    weeklyPlan: weeklyPlanArb,
    weeklyPlanStartDate: isoDateArb,
    cookPhoneNumber: phoneArb,
    excludedDishIds: fc.array(fc.stringMatching(/^[a-z0-9]{2,8}$/), { minLength: 0, maxLength: 5 }),
    fewMealsSelectedDay: fc.integer({ min: 0, max: 6 }),
    fewMealsSelectedSlot: slotArb,
    fewMealsAlternatives: alternativesArb,
    previousWeeklyPlan: weeklyPlanArb,
  },
  {
    requiredKeys: ['phoneNumber', 'onboardingComplete', 'conversationState'],
  },
);

// ============================================================
// Property 20: State persistence round-trip
// (Feature: smart-meal-planner-workflow, Property 20: State persistence round-trip)
// ============================================================

describe('Property 20: State persistence round-trip (Feature: smart-meal-planner-workflow, Property 20: State persistence round-trip)', () => {
  let mockDocClient: ReturnType<typeof createMockDocClient>;
  let repo: DynamoDBUserStateRepository;

  beforeEach(() => {
    mockDocClient = createMockDocClient();
    repo = new DynamoDBUserStateRepository('MealPlannerUsers-test', mockDocClient as any);
  });

  /**
   * **Validates: Requirements 12.1**
   *
   * For any UserState object, serializing it via the DynamoDB repository's
   * serialize method and then deserializing should produce an equivalent
   * UserState with all fields preserved.
   */
  it('serialize then deserialize produces equivalent state for any UserState', async () => {
    await fc.assert(
      fc.asyncProperty(userStateArb, async (state) => {
        await repo.saveUser(state);
        const loaded = await repo.getUser(state.phoneNumber);

        expect(loaded).not.toBeNull();

        // Required fields
        expect(loaded!.phoneNumber).toBe(state.phoneNumber);
        expect(loaded!.onboardingComplete).toBe(state.onboardingComplete);
        expect(loaded!.conversationState).toBe(state.conversationState);

        // Optional fields: if present in input, must match in output
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

        if (state.excludedDishIds !== undefined) {
          expect(loaded!.excludedDishIds).toEqual(state.excludedDishIds);
        } else {
          expect(loaded!.excludedDishIds).toBeUndefined();
        }

        if (state.fewMealsSelectedDay !== undefined) {
          expect(loaded!.fewMealsSelectedDay).toBe(state.fewMealsSelectedDay);
        } else {
          expect(loaded!.fewMealsSelectedDay).toBeUndefined();
        }

        if (state.fewMealsSelectedSlot !== undefined) {
          expect(loaded!.fewMealsSelectedSlot).toBe(state.fewMealsSelectedSlot);
        } else {
          expect(loaded!.fewMealsSelectedSlot).toBeUndefined();
        }

        if (state.fewMealsAlternatives !== undefined) {
          expect(loaded!.fewMealsAlternatives).toEqual(state.fewMealsAlternatives);
        } else {
          expect(loaded!.fewMealsAlternatives).toBeUndefined();
        }

        if (state.previousWeeklyPlan !== undefined) {
          expect(loaded!.previousWeeklyPlan).toEqual(state.previousWeeklyPlan);
        } else {
          expect(loaded!.previousWeeklyPlan).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });
});
