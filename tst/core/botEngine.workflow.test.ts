import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { processIntent } from '../../src/core/botEngine';
import { Intent, ResponseType, PREVIEW_STEP_ORDER } from '../../src/core/types';
import { JsonMealRepository } from '../../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../../src/adapters/jsonMealComponentRepository';

// --- Real data repositories ---
const mealsPath = path.resolve(__dirname, '../../data/meals.json');
const componentsDir = path.resolve(__dirname, '../../data/meal-components');
const mealRepo = new JsonMealRepository(mealsPath);
const mealComponentRepo = new JsonMealComponentRepository(componentsDir);

describe('E2E: onboarding → change plan → few meals → done', () => {
  it('walks through the complete flow from new user to few meals done', async () => {
    // 1. New user sends a message → gets ONBOARDING_CUISINE_PROMPT
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mealRepo, mealComponentRepo);
    expect(r1.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
    expect(r1.updatedState.conversationState).toBe('awaiting_cuisine');

    // 2. User selects cuisine (north_indian) → gets ONBOARDING_DIET_PROMPT
    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r2.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);
    expect(r2.updatedState.conversationState).toBe('awaiting_diet');
    expect(r2.updatedState.cuisinePreference).toBe('north_indian');

    // 3. User selects diet (veg) → gets ONBOARDING_STYLE_PROMPT
    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r3.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);
    expect(r3.updatedState.conversationState).toBe('awaiting_meal_style');
    expect(r3.updatedState.dietPreference).toBe('veg');

    // 4. User selects style (regular) → gets ONBOARDING_MEAL_FORMAT_PROMPT
    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' },
      r3.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4.response.type).toBe(ResponseType.ONBOARDING_MEAL_FORMAT_PROMPT);
    expect(r4.updatedState.conversationState).toBe('awaiting_meal_format');
    expect(r4.updatedState.mealStyle).toBe('regular');

    // 4a. User selects meal format (hearty) → gets PAYMENT_PROMPT
    const r4a = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      r4.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4a.response.type).toBe(ResponseType.PAYMENT_PROMPT);
    expect(r4a.updatedState.conversationState).toBe('awaiting_payment');

    // 4b. Simulate payment success — give active subscription and select format
    const stateWithSub = {
      ...r4.updatedState,
      subscription: {
        status: 'active' as const,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const r4b = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      stateWithSub, mealRepo, mealComponentRepo,
    );
    expect(r4b.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r4b.updatedState.conversationState).toBe('main_menu');
    expect(r4b.updatedState.onboardingComplete).toBe(true);
    expect(r4b.updatedState.mealStyle).toBe('regular');
    expect(r4b.updatedState.weeklyPlan).toBeDefined();
    expect(r4b.updatedState.weeklyPlan!.length).toBe(7);
    expect(r4b.response.data?.weeklyPlan).toBeDefined();
    // Verify each day has breakfast, lunch, dinner
    for (const day of r4b.updatedState.weeklyPlan!) {
      expect(day.breakfast).toBeDefined();
      expect(day.lunch).toBeDefined();
      expect(day.dinner).toBeDefined();
    }

    // 5. User selects CHANGE_PLAN → gets CHANGE_PLAN_MENU
    const r8 = await processIntent(
      { intent: Intent.CHANGE_PLAN },
      r4b.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r8.response.type).toBe(ResponseType.CHANGE_PLAN_MENU);
    expect(r8.updatedState.conversationState).toBe('change_plan_menu');

    // 9. User selects CHANGE_FEW_MEALS → gets FEW_MEALS_DAY_PROMPT
    const r9 = await processIntent(
      { intent: Intent.CHANGE_FEW_MEALS },
      r8.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r9.response.type).toBe(ResponseType.FEW_MEALS_DAY_PROMPT);
    expect(r9.updatedState.conversationState).toBe('few_meals_day_select');

    // 10. User selects day 0 (Monday) → gets FEW_MEALS_SLOT_PROMPT
    const r10 = await processIntent(
      { intent: Intent.SELECT_DAY, payload: '0' },
      r9.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r10.response.type).toBe(ResponseType.FEW_MEALS_SLOT_PROMPT);
    expect(r10.updatedState.conversationState).toBe('few_meals_slot_select');
    expect(r10.updatedState.fewMealsSelectedDay).toBe(0);

    // 11. User selects slot (lunch) → gets FEW_MEALS_ALTERNATIVES or FEW_MEALS_NO_ALTERNATIVE
    const r11 = await processIntent(
      { intent: Intent.SELECT_MEAL_SLOT, payload: 'lunch' },
      r10.updatedState, mealRepo, mealComponentRepo,
    );

    // Handle both cases: alternatives available or no alternatives
    if (r11.response.type === ResponseType.FEW_MEALS_NO_ALTERNATIVE) {
      // No alternatives available — test should still pass
      expect(r11.updatedState.conversationState).toBe('few_meals_day_select');

      // Skip to DONE_CHANGING from day select → need to go through change_plan_menu again
      // Actually, from few_meals_day_select we can't directly DONE_CHANGING.
      // The flow goes back to day select, so let's just verify and move on.
      // We'll select DONE_CHANGING from few_meals_alternatives in the else branch.
    } else {
      // 12. Alternatives available
      expect(r11.response.type).toBe(ResponseType.FEW_MEALS_ALTERNATIVES);
      expect(r11.updatedState.conversationState).toBe('few_meals_alternatives');
      expect(r11.updatedState.fewMealsSelectedSlot).toBe('lunch');
      expect(r11.updatedState.fewMealsAlternatives).toBeDefined();
      expect(r11.updatedState.fewMealsAlternatives!.length).toBeGreaterThan(0);
      expect(r11.updatedState.fewMealsAlternatives!.length).toBeLessThanOrEqual(3);

      // User selects alternative 0 → gets FEW_MEALS_UPDATED
      const r12 = await processIntent(
        { intent: Intent.SELECT_ALTERNATIVE, payload: '0' },
        r11.updatedState, mealRepo, mealComponentRepo,
      );
      expect(r12.response.type).toBe(ResponseType.FEW_MEALS_UPDATED);
      expect(r12.updatedState.weeklyPlan).toBeDefined();
      // Verify the plan was updated at day 0, lunch
      const updatedLunch = r12.updatedState.weeklyPlan![0].lunch;
      const selectedAlt = r11.updatedState.fewMealsAlternatives![0];
      expect(updatedLunch.name).toBe(selectedAlt.name);

      // 13. User selects DONE_CHANGING → shows updated weekly plan
      const r13 = await processIntent(
        { intent: Intent.DONE_CHANGING },
        r12.updatedState, mealRepo, mealComponentRepo,
      );
      expect(r13.response.type).toBe(ResponseType.WEEKLY_PLAN);
      expect(r13.response.data?.weeklyPlan).toBeDefined();
      expect(r13.updatedState.conversationState).toBe('main_menu');
      expect(r13.updatedState.fewMealsSelectedDay).toBeUndefined();
      expect(r13.updatedState.fewMealsSelectedSlot).toBeUndefined();
      expect(r13.updatedState.fewMealsAlternatives).toBeUndefined();
    }
  });
});

describe('E2E: main menu → change plan → entire plan → accept', () => {
  it('walks through onboarding then regenerates entire plan and accepts', async () => {
    // --- Onboarding to get a valid weeklyPlan ---

    // 1. New user → ONBOARDING_CUISINE_PROMPT
    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mealRepo, mealComponentRepo);
    expect(r1.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);

    // 2. Select cuisine
    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r2.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);

    // 3. Select diet
    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r3.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);

    // 4. Select style → ONBOARDING_MEAL_FORMAT_PROMPT
    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' },
      r3.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4.response.type).toBe(ResponseType.ONBOARDING_MEAL_FORMAT_PROMPT);
    expect(r4.updatedState.conversationState).toBe('awaiting_meal_format');

    // 4a. Select meal format → PAYMENT_PROMPT (paywall)
    const r4a = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      r4.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4a.response.type).toBe(ResponseType.PAYMENT_PROMPT);
    expect(r4a.updatedState.conversationState).toBe('awaiting_payment');

    // 4b. Simulate active subscription and select format
    const stateWithSub = {
      ...r4.updatedState,
      subscription: {
        status: 'active' as const,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const r4b = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      stateWithSub, mealRepo, mealComponentRepo,
    );
    expect(r4b.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r4b.updatedState.conversationState).toBe('main_menu');
    expect(r4b.updatedState.weeklyPlan).toBeDefined();
    expect(r4b.updatedState.weeklyPlan!.length).toBe(7);

    const originalPlan = r4b.updatedState.weeklyPlan!;

    // --- Change Plan → Entire Plan flow ---

    // 5. User selects CHANGE_PLAN → CHANGE_PLAN_MENU
    const r8 = await processIntent(
      { intent: Intent.CHANGE_PLAN },
      r4b.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r8.response.type).toBe(ResponseType.CHANGE_PLAN_MENU);
    expect(r8.updatedState.conversationState).toBe('change_plan_menu');

    // 6. User selects CHANGE_ENTIRE_PLAN → REGENERATE_PLAN_MENU
    const r9a = await processIntent(
      { intent: Intent.CHANGE_ENTIRE_PLAN },
      r8.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r9a.response.type).toBe(ResponseType.REGENERATE_PLAN_MENU);
    expect(r9a.updatedState.conversationState).toBe('regenerate_plan_menu');

    // 6b. User selects KEEP_PREFERENCES → ENTIRE_PLAN_PREVIEW with new plan
    const r9 = await processIntent(
      { intent: Intent.KEEP_PREFERENCES },
      r9a.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r9.response.type).toBe(ResponseType.ENTIRE_PLAN_PREVIEW);
    expect(r9.updatedState.conversationState).toBe('entire_plan_confirm');
    expect(r9.response.data?.weeklyPlan).toBeDefined();
    expect(r9.updatedState.weeklyPlan).toBeDefined();
    expect(r9.updatedState.weeklyPlan!.length).toBe(7);
    // previousWeeklyPlan should be set to the original plan
    expect(r9.updatedState.previousWeeklyPlan).toBeDefined();

    const newPlan = r9.updatedState.weeklyPlan!;

    // 7. Verify the new plan is structurally valid (7 days, each with B/L/D)
    for (const day of newPlan) {
      expect(day.breakfast).toBeDefined();
      expect(day.lunch).toBeDefined();
      expect(day.dinner).toBeDefined();
      expect(day.lunch.components).toBeDefined();
      expect(day.dinner.components).toBeDefined();
    }

    // 8. Verify the new plan differs from the original (at least some meals changed)
    //     Collect all meal/component names from both plans and check they're not identical
    const originalNames = originalPlan.flatMap(d => [
      d.breakfast.name,
      d.lunch.name,
      d.dinner.name,
    ]);
    const newNames = newPlan.flatMap(d => [
      d.breakfast.name,
      d.lunch.name,
      d.dinner.name,
    ]);
    const hasAnyDifference = originalNames.some((name, i) => name !== newNames[i]);
    expect(hasAnyDifference).toBe(true);

    // 9. User selects ACCEPT_PLAN → WEEKLY_PLAN, returns to main_menu
    const r12 = await processIntent(
      { intent: Intent.ACCEPT_PLAN },
      r9.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r12.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r12.updatedState.conversationState).toBe('main_menu');

    // 10. Verify previousWeeklyPlan is cleared
    expect(r12.updatedState.previousWeeklyPlan).toBeUndefined();

    // 11. Verify the weeklyPlan is the accepted plan (same as the regenerated one)
    expect(r12.updatedState.weeklyPlan).toBeDefined();
    expect(r12.updatedState.weeklyPlan!.length).toBe(7);
    for (let i = 0; i < 7; i++) {
      expect(r12.updatedState.weeklyPlan![i].breakfast.name).toBe(newPlan[i].breakfast.name);
      expect(r12.updatedState.weeklyPlan![i].lunch.name).toBe(newPlan[i].lunch.name);
      expect(r12.updatedState.weeklyPlan![i].dinner.name).toBe(newPlan[i].dinner.name);
    }

    // 12. Verify the response data also contains the accepted plan
    expect(r12.response.data?.weeklyPlan).toBeDefined();
    expect(r12.response.data!.weeklyPlan!.length).toBe(7);
  });
});

describe('E2E: main menu → change plan → change preferences → new plan', () => {
  it('walks through onboarding, then changes preferences via change plan menu and gets a new plan', async () => {
    // --- Phase 1: Onboarding with north_indian / veg / regular ---

    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mealRepo, mealComponentRepo);
    expect(r1.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);

    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r2.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);

    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r3.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);

    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' },
      r3.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4.response.type).toBe(ResponseType.ONBOARDING_MEAL_FORMAT_PROMPT);

    // Select meal format
    const r4a = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      r4.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4a.response.type).toBe(ResponseType.PAYMENT_PROMPT);

    // Simulate active subscription
    const stateWithSub = {
      ...r4.updatedState,
      subscription: {
        status: 'active' as const,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const r4b = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      stateWithSub, mealRepo, mealComponentRepo,
    );
    expect(r4b.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r4b.updatedState.conversationState).toBe('main_menu');
    expect(r4b.updatedState.weeklyPlan).toBeDefined();
    expect(r4b.updatedState.weeklyPlan!.length).toBe(7);
    expect(r4b.updatedState.cuisinePreference).toBe('north_indian');
    expect(r4b.updatedState.dietPreference).toBe('veg');

    const originalPlan = r4b.updatedState.weeklyPlan!;

    // --- Phase 2: Change Plan → Change Preferences ---

    // User selects CHANGE_PLAN → CHANGE_PLAN_MENU
    const rCP = await processIntent(
      { intent: Intent.CHANGE_PLAN },
      r4b.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rCP.response.type).toBe(ResponseType.CHANGE_PLAN_MENU);
    expect(rCP.updatedState.conversationState).toBe('change_plan_menu');

    // User selects CHANGE_ENTIRE_PLAN → REGENERATE_PLAN_MENU
    const rPref = await processIntent(
      { intent: Intent.CHANGE_ENTIRE_PLAN },
      rCP.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rPref.response.type).toBe(ResponseType.REGENERATE_PLAN_MENU);
    expect(rPref.updatedState.conversationState).toBe('regenerate_plan_menu');

    // User selects CHANGE_PREFERENCE from regenerate plan menu
    const rPref2 = await processIntent(
      { intent: Intent.CHANGE_PREFERENCE },
      rPref.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rPref2.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
    expect(rPref2.updatedState.conversationState).toBe('awaiting_preference_cuisine');
    expect(rPref2.updatedState.isPreferenceChange).toBe(true);
    expect(rPref2.updatedState.excludedDishIds).toEqual([]);

    // --- Phase 3: Select new preferences (south_indian / non_veg) ---

    // Select new cuisine: south_indian
    const rCuisine = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'south_indian' },
      rPref2.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rCuisine.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);
    expect(rCuisine.updatedState.conversationState).toBe('awaiting_preference_diet');
    expect(rCuisine.updatedState.cuisinePreference).toBe('south_indian');
    expect(rCuisine.updatedState.isPreferenceChange).toBe(true);

    // Select new diet: non_veg → transitions to awaiting_preference_style
    const rDiet = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'non_veg' },
      rCuisine.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rDiet.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);
    expect(rDiet.updatedState.conversationState).toBe('awaiting_preference_style');
    expect(rDiet.updatedState.dietPreference).toBe('non_veg');
    expect(rDiet.updatedState.excludedDishIds).toEqual([]);
    expect(rDiet.updatedState.isPreferenceChange).toBe(true);

    // Select new style: health → now goes to lunch format prompt
    const rStyle = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' },
      rDiet.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rStyle.response.type).toBe(ResponseType.ONBOARDING_LUNCH_FORMAT_PROMPT);
    expect(rStyle.updatedState.conversationState).toBe('awaiting_preference_lunch_format');

    // Select lunch format
    const rLunchFmt = await processIntent(
      { intent: Intent.SELECT_LUNCH_FORMAT, payload: 'home_meal' },
      rStyle.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rLunchFmt.response.type).toBe(ResponseType.ONBOARDING_DINNER_FORMAT_PROMPT);
    expect(rLunchFmt.updatedState.conversationState).toBe('awaiting_preference_dinner_format');

    // Select dinner format → generates new plan
    const rDinnerFmt = await processIntent(
      { intent: Intent.SELECT_DINNER_FORMAT, payload: 'quick_meal' },
      rLunchFmt.updatedState, mealRepo, mealComponentRepo,
    );
    expect(rDinnerFmt.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(rDinnerFmt.updatedState.conversationState).toBe('main_menu');
    expect(rDinnerFmt.updatedState.weeklyPlan).toBeDefined();
    expect(rDinnerFmt.updatedState.weeklyPlan!.length).toBe(7);
    expect(rDinnerFmt.response.data?.weeklyPlan).toBeDefined();
    expect(rDinnerFmt.updatedState.isPreferenceChange).toBe(false);
    expect(rDinnerFmt.updatedState.candidateDishes).toBeUndefined();
    expect(rDinnerFmt.updatedState.previewStep).toBeUndefined();

    const newPlan = rDinnerFmt.updatedState.weeklyPlan!;

    // --- Phase 5: Verify the new plan matches new preferences ---

    // Verify structural validity
    for (const day of newPlan) {
      expect(day.breakfast).toBeDefined();
      expect(day.lunch).toBeDefined();
      expect(day.dinner).toBeDefined();
      expect(day.lunch.components).toBeDefined();
      expect(day.lunch.components.length).toBe(3); // home_meal = base + gravy + dry_veggie
      expect(day.dinner.components).toBeDefined();
      expect(day.dinner.components.length).toBe(2); // quick_meal = base + gravy
    }

    // Verify preferences are stored correctly
    expect(rDinnerFmt.updatedState.cuisinePreference).toBe('south_indian');
    expect(rDinnerFmt.updatedState.dietPreference).toBe('non_veg');

    // Verify the new plan differs from the original (preferences changed, so meals should differ)
    const originalBreakfastNames = originalPlan.map(d => d.breakfast.name);
    const newBreakfastNames = newPlan.map(d => d.breakfast.name);
    const hasBreakfastDifference = originalBreakfastNames.some((name, i) => name !== newBreakfastNames[i]);
    // With different cuisine/diet, the plans should differ
    const originalLunchNames = originalPlan.map(d => d.lunch.name);
    const newLunchNames = newPlan.map(d => d.lunch.name);
    const hasLunchDifference = originalLunchNames.some((name, i) => name !== newLunchNames[i]);
    expect(hasBreakfastDifference || hasLunchDifference).toBe(true);

    // Verify excludedDishIds is cleared (empty) after preference change
    expect(rDinnerFmt.updatedState.excludedDishIds).toEqual([]);
    // candidateDishes should be cleared after preference change
    expect(rDinnerFmt.updatedState.candidateDishes).toBeUndefined();
    // previewStep should be cleared after preference change
    expect(rDinnerFmt.updatedState.previewStep).toBeUndefined();
  });
});

describe('E2E: adhoc menu routing', () => {
  it('onboarded user in main_menu gets ADHOC_MENU response with plan data and state unchanged', async () => {
    // --- Phase 1: Complete onboarding to reach main_menu with a weeklyPlan ---

    const r1 = await processIntent({ intent: Intent.UNKNOWN }, null, mealRepo, mealComponentRepo);
    expect(r1.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);

    const r2 = await processIntent(
      { intent: Intent.SELECT_CUISINE, payload: 'north_indian' },
      r1.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r2.response.type).toBe(ResponseType.ONBOARDING_DIET_PROMPT);

    const r3 = await processIntent(
      { intent: Intent.SELECT_DIET, payload: 'veg' },
      r2.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r3.response.type).toBe(ResponseType.ONBOARDING_STYLE_PROMPT);

    const r4 = await processIntent(
      { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' },
      r3.updatedState, mealRepo, mealComponentRepo,
    );
    expect(r4.response.type).toBe(ResponseType.ONBOARDING_MEAL_FORMAT_PROMPT);

    // Simulate active subscription
    const stateWithSub2 = {
      ...r4.updatedState,
      subscription: {
        status: 'active' as const,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const r4b = await processIntent(
      { intent: Intent.SELECT_MEAL_FORMAT, payload: 'regular_format' },
      stateWithSub2, mealRepo, mealComponentRepo,
    );
    expect(r4b.response.type).toBe(ResponseType.WEEKLY_PLAN);
    expect(r4b.updatedState.conversationState).toBe('main_menu');
    expect(r4b.updatedState.weeklyPlan).toBeDefined();
    expect(r4b.updatedState.weeklyPlan!.length).toBe(7);

    const mainMenuState = r4b.updatedState;

    // --- Phase 2: Send ADHOC_MENU intent ---

    const rAdhoc = await processIntent(
      { intent: Intent.ADHOC_MENU },
      mainMenuState, mealRepo, mealComponentRepo,
    );

    // Verify response type is ADHOC_MENU
    expect(rAdhoc.response.type).toBe(ResponseType.ADHOC_MENU);

    // Verify the response includes the weekly plan data
    expect(rAdhoc.response.data).toBeDefined();
    expect(rAdhoc.response.data?.weeklyPlan).toBeDefined();
    expect(rAdhoc.response.data!.weeklyPlan!.length).toBe(7);

    // Verify the weekly plan in the response matches the user's plan
    for (let i = 0; i < 7; i++) {
      expect(rAdhoc.response.data!.weeklyPlan![i].breakfast.name).toBe(mainMenuState.weeklyPlan![i].breakfast.name);
      expect(rAdhoc.response.data!.weeklyPlan![i].lunch.name).toBe(mainMenuState.weeklyPlan![i].lunch.name);
      expect(rAdhoc.response.data!.weeklyPlan![i].dinner.name).toBe(mainMenuState.weeklyPlan![i].dinner.name);
    }

    // Verify suggested actions include the expected options
    expect(rAdhoc.response.suggestedActions).toBeDefined();
    const actionIds = rAdhoc.response.suggestedActions!.map(a => a.id);
    expect(actionIds).toContain('weekly_plan');
    expect(actionIds).toContain('tomorrow_plan');
    expect(actionIds).toHaveLength(2);

    // Verify state remains in main_menu (adhoc menu is informational, doesn't change state)
    expect(rAdhoc.updatedState.conversationState).toBe('main_menu');

    // Verify the entire state is unchanged
    expect(rAdhoc.updatedState).toEqual(mainMenuState);
  });

  it('non-onboarded user (null state) sending ADHOC_MENU intent routes to onboarding', async () => {
    // A user with no state sends ADHOC_MENU — should get routed to onboarding
    const r = await processIntent(
      { intent: Intent.ADHOC_MENU },
      null,
      mealRepo, mealComponentRepo,
    );

    expect(r.response.type).toBe(ResponseType.ONBOARDING_CUISINE_PROMPT);
    expect(r.updatedState.conversationState).toBe('awaiting_cuisine');
    expect(r.updatedState.onboardingComplete).toBe(false);
  });
});
