import { describe, it, expect } from 'vitest';
import {
  formatWeeklyPlan,
  formatDayPlan,
  formatGroceryList,
  formatCookMessage,
  formatBotResponse,
} from '../src/messageFormatter';
import type { DayPlan, WeeklyPlan, GroceryItem, Meal, ComposedMeal, MealComponent, BotResponse } from '../src/core/types';
import { ResponseType } from '../src/core/types';
import {
  WEEKLY_PLAN_HEADER,
  DAY_PLAN_HEADER,
  WEEKLY_GROCERY_HEADER,
  ONBOARDING_CUISINE_PROMPT,
  ONBOARDING_DIET_PROMPT,
  ONBOARDING_STYLE_PROMPT,
  ONBOARDING_COMPLETE,
  NO_PLAN_PROMPT,
  COOK_NUMBER_PROMPT,
  COOK_NUMBER_SAVED,
  COOK_MESSAGE_SENT,
  NO_COOK_PROMPT,
  SWAP_CONFIRMATION,
  SWAP_NO_ALTERNATIVE,
  WEEKLY_REMINDER,
  EXPIRED_PLAN_PROMPT,
  INVALID_INPUT,
  INVALID_PHONE,
  GENERIC_ERROR,
} from '../src/messages';

function makeMeal(name: string, slot: 'breakfast' | 'lunch' | 'dinner' = 'lunch'): Meal {
  return {
    id: `test-${name}`,
    name,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'health',
    slots: [slot],
    ingredients: [
      { name: 'Rice', quantity: '200g', category: 'grains' },
      { name: 'Onion', quantity: '1', category: 'vegetables' },
    ],
  };
}

function makeComposedMeal(name: string): ComposedMeal {
  const base: MealComponent = {
    id: `base-${name}`, name: `${name} Base`, category: 'base',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Rice', quantity: '200g', category: 'grains' }],
  };
  const gravy: MealComponent = {
    id: `gravy-${name}`, name: `${name} Gravy`, category: 'gravy',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Onion', quantity: '1', category: 'vegetables' }],
  };
  const dry: MealComponent = {
    id: `dry-${name}`, name: `${name} Dry`, category: 'dry_veggie',
    cuisine: 'north_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Beans', quantity: '100g', category: 'vegetables' }],
  };
  const side: MealComponent = {
    id: `side-${name}`, name: `${name} Side`, category: 'side',
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

function makeDayPlan(day: string): DayPlan {
  return {
    day,
    breakfast: makeMeal(`${day}-Breakfast`, 'breakfast'),
    lunch: makeComposedMeal(`${day}-Lunch`),
    dinner: makeComposedMeal(`${day}-Dinner`),
  };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function makeWeeklyPlan(): WeeklyPlan {
  return DAYS.map((day) => makeDayPlan(day));
}

describe('formatWeeklyPlan', () => {
  it('should include the weekly plan header', () => {
    const plan = makeWeeklyPlan();
    const result = formatWeeklyPlan(plan);
    expect(result).toContain(WEEKLY_PLAN_HEADER);
  });

  it('should include all 7 day names', () => {
    const plan = makeWeeklyPlan();
    const result = formatWeeklyPlan(plan);
    for (const day of DAYS) {
      expect(result).toContain(day);
    }
  });

  it('should include all 21 meal names', () => {
    const plan = makeWeeklyPlan();
    const result = formatWeeklyPlan(plan);
    for (const day of plan) {
      expect(result).toContain(day.breakfast.name);
      expect(result).toContain(day.lunch.name);
      expect(result).toContain(day.dinner.name);
    }
  });
});

describe('formatDayPlan', () => {
  it('should include the day plan header with day name', () => {
    const day = makeDayPlan('Wednesday');
    const result = formatDayPlan(day);
    expect(result).toContain(DAY_PLAN_HEADER('Wednesday'));
  });

  it('should include all 3 meal names', () => {
    const day = makeDayPlan('Thursday');
    const result = formatDayPlan(day);
    expect(result).toContain(day.breakfast.name);
    expect(result).toContain(day.lunch.name);
    expect(result).toContain(day.dinner.name);
  });
});

describe('formatGroceryList', () => {
  it('should include the grocery header', () => {
    const items: GroceryItem[] = [
      { name: 'Rice', quantity: '1kg', category: 'grains' },
    ];
    const result = formatGroceryList(items);
    expect(result).toContain(WEEKLY_GROCERY_HEADER);
  });

  it('should group items by category', () => {
    const items: GroceryItem[] = [
      { name: 'Rice', quantity: '1kg', category: 'grains' },
      { name: 'Wheat', quantity: '500g', category: 'grains' },
      { name: 'Onion', quantity: '2', category: 'vegetables' },
    ];
    const result = formatGroceryList(items);
    expect(result).toContain('Grains');
    expect(result).toContain('Vegetables');
    expect(result).toContain('Rice');
    expect(result).toContain('Wheat');
    expect(result).toContain('Onion');
  });

  it('should include all ingredient names', () => {
    const items: GroceryItem[] = [
      { name: 'Turmeric', quantity: '1 tsp', category: 'spices' },
      { name: 'Milk', quantity: '500ml', category: 'dairy' },
    ];
    const result = formatGroceryList(items);
    expect(result).toContain('Turmeric');
    expect(result).toContain('Milk');
  });
});

describe('formatCookMessage', () => {
  it('should include the day name', () => {
    const day = makeDayPlan('Friday');
    const result = formatCookMessage(day);
    expect(result).toContain('Friday');
  });

  it('should list all 3 meal slots and dishes', () => {
    const day = makeDayPlan('Saturday');
    const result = formatCookMessage(day);
    expect(result).toContain('Breakfast');
    expect(result).toContain('Lunch');
    expect(result).toContain('Dinner');
    expect(result).toContain(day.breakfast.name);
    expect(result).toContain(day.lunch.name);
    expect(result).toContain(day.dinner.name);
  });
});

describe('formatBotResponse', () => {
  it('should format ONBOARDING_CUISINE_PROMPT with cuisine buttons', () => {
    const response: BotResponse = { type: ResponseType.ONBOARDING_CUISINE_PROMPT };
    const result = formatBotResponse(response);
    expect(result.text).toContain(ONBOARDING_CUISINE_PROMPT);
    expect(result.buttons).toBeDefined();
    expect(result.buttons!.length).toBe(3);
  });

  it('should format ONBOARDING_DIET_PROMPT with diet buttons', () => {
    const response: BotResponse = { type: ResponseType.ONBOARDING_DIET_PROMPT };
    const result = formatBotResponse(response);
    expect(result.text).toBe(ONBOARDING_DIET_PROMPT);
    expect(result.buttons!.length).toBe(3);
  });

  it('should format ONBOARDING_STYLE_PROMPT with style buttons', () => {
    const response: BotResponse = { type: ResponseType.ONBOARDING_STYLE_PROMPT };
    const result = formatBotResponse(response);
    expect(result.text).toBe(ONBOARDING_STYLE_PROMPT);
    expect(result.buttons!.length).toBe(2);
  });

  it('should format ONBOARDING_COMPLETE with main menu buttons', () => {
    const response: BotResponse = { type: ResponseType.ONBOARDING_COMPLETE };
    const result = formatBotResponse(response);
    expect(result.text).toBe(ONBOARDING_COMPLETE);
    expect(result.buttons).toBeDefined();
  });

  it('should format WEEKLY_PLAN with plan data', () => {
    const plan = makeWeeklyPlan();
    const response: BotResponse = {
      type: ResponseType.WEEKLY_PLAN,
      data: { weeklyPlan: plan },
    };
    const result = formatBotResponse(response);
    expect(result.text).toContain(WEEKLY_PLAN_HEADER);
    expect(result.text).toContain('Monday');
    // Buttons are on the follow-up message
    expect(result.followUp).toBeDefined();
    expect(result.followUp![0].buttons).toBeDefined();
  });

  it('should format TOMORROW_PLAN with day plan data', () => {
    const dayPlan = makeDayPlan('Tuesday');
    const response: BotResponse = {
      type: ResponseType.TOMORROW_PLAN,
      data: { dayPlan },
    };
    const result = formatBotResponse(response);
    expect(result.text).toContain('Tuesday');
    expect(result.text).toContain(dayPlan.breakfast.name);
  });

  it('should format SWAP_CONFIRMATION with old and new meal', () => {
    const response: BotResponse = {
      type: ResponseType.SWAP_CONFIRMATION,
      data: { oldMeal: 'Dal Rice', newMeal: 'Paneer Tikka' },
    };
    const result = formatBotResponse(response);
    expect(result.text).toContain(SWAP_CONFIRMATION('Dal Rice', 'Paneer Tikka'));
  });

  it('should format NO_PLAN_ERROR with generate plan button', () => {
    const response: BotResponse = { type: ResponseType.NO_PLAN_ERROR };
    const result = formatBotResponse(response);
    expect(result.text).toBe(NO_PLAN_PROMPT);
    expect(result.buttons).toBeDefined();
    expect(result.buttons!.some((b) => b.id === 'weekly_plan')).toBe(true);
  });

  it('should format NO_COOK_ERROR', () => {
    const response: BotResponse = { type: ResponseType.NO_COOK_ERROR };
    const result = formatBotResponse(response);
    expect(result.text).toBe(NO_COOK_PROMPT);
  });

  it('should format INVALID_INPUT with suggested actions as buttons', () => {
    const response: BotResponse = {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: [
        { id: 'veg', label: 'Veg' },
        { id: 'non_veg', label: 'Non-Veg' },
      ],
    };
    const result = formatBotResponse(response);
    expect(result.text).toBe(INVALID_INPUT);
    expect(result.buttons!.length).toBe(2);
  });

  it('should format INVALID_PHONE', () => {
    const response: BotResponse = { type: ResponseType.INVALID_PHONE };
    const result = formatBotResponse(response);
    expect(result.text).toBe(INVALID_PHONE);
  });

  it('should format COOK_NUMBER_PROMPT', () => {
    const response: BotResponse = { type: ResponseType.COOK_NUMBER_PROMPT };
    const result = formatBotResponse(response);
    expect(result.text).toBe(COOK_NUMBER_PROMPT);
  });

  it('should format COOK_NUMBER_SAVED', () => {
    const response: BotResponse = { type: ResponseType.COOK_NUMBER_SAVED };
    const result = formatBotResponse(response);
    expect(result.text).toContain(COOK_NUMBER_SAVED);
    expect(result.text).toContain('hi');
    expect(result.buttons).toBeUndefined();
  });

  it('should format COOK_MESSAGE_SENT', () => {
    const response: BotResponse = { type: ResponseType.COOK_MESSAGE_SENT };
    const result = formatBotResponse(response);
    expect(result.text).toContain(COOK_MESSAGE_SENT);
  });

  it('should format WEEKLY_REMINDER', () => {
    const response: BotResponse = { type: ResponseType.WEEKLY_REMINDER };
    const result = formatBotResponse(response);
    expect(result.text).toContain(WEEKLY_REMINDER);
    expect(result.buttons!.some((b) => b.id === 'weekly_plan')).toBe(true);
  });

  it('should format EXPIRED_PLAN_PROMPT', () => {
    const response: BotResponse = { type: ResponseType.EXPIRED_PLAN_PROMPT };
    const result = formatBotResponse(response);
    expect(result.text).toBe(EXPIRED_PLAN_PROMPT);
    expect(result.buttons!.some((b) => b.id === 'weekly_plan')).toBe(true);
  });

  it('should format DAILY_REMINDER with day plan', () => {
    const dayPlan = makeDayPlan('Monday');
    const response: BotResponse = {
      type: ResponseType.DAILY_REMINDER,
      data: { dayPlan },
    };
    const result = formatBotResponse(response);
    expect(result.text).toContain('Monday');
    expect(result.text).toContain(dayPlan.breakfast.name);
  });

  it('should format SWAP_NO_ALTERNATIVE', () => {
    const response: BotResponse = { type: ResponseType.SWAP_NO_ALTERNATIVE };
    const result = formatBotResponse(response);
    expect(result.text).toBe(SWAP_NO_ALTERNATIVE);
  });

  it('should format ERROR with generic error message', () => {
    const response: BotResponse = { type: ResponseType.ERROR };
    const result = formatBotResponse(response);
    expect(result.text).toBe(GENERIC_ERROR);
  });

  it('should format WEEKLY_GROCERY_LIST with grocery data', () => {
    const groceryList: GroceryItem[] = [
      { name: 'Rice', quantity: '1kg', category: 'grains' },
      { name: 'Onion', quantity: '2', category: 'vegetables' },
    ];
    const response: BotResponse = {
      type: ResponseType.WEEKLY_GROCERY_LIST,
      data: { groceryList },
    };
    const result = formatBotResponse(response);
    expect(result.text).toContain(WEEKLY_GROCERY_HEADER);
    expect(result.text).toContain('Rice');
    expect(result.text).toContain('Onion');
  });
});
