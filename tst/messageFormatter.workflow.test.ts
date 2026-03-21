import { describe, it, expect } from 'vitest';
import { formatBotResponse } from '../src/messageFormatter';
import type { BotResponse, Meal, MealComponent, ComposedMeal, DayPlan, WeeklyPlan, GroceryItem } from '../src/core/types';
import { ResponseType } from '../src/core/types';
import { FOOTER_HINT } from '../src/messages';

// --- Test helpers ---

function makeMeal(name: string, slot: 'breakfast' | 'lunch' | 'dinner' = 'breakfast'): Meal {
  return {
    id: `test-${name}`,
    name,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'health',
    slots: [slot],
    ingredients: [{ name: 'Rice', quantity: '200g', category: 'grains' }],
  };
}

function makeComponent(name: string, category: 'base' | 'gravy' | 'dry_veggie' | 'side'): MealComponent {
  return {
    id: `${category}-${name}`,
    name: `${name} ${category}`,
    category,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Onion', quantity: '1', category: 'vegetables' }],
  };
}

function makeComposedMeal(prefix: string): ComposedMeal {
  const components = [
    makeComponent(prefix, 'base'),
    makeComponent(prefix, 'gravy'),
    makeComponent(prefix, 'dry_veggie'),
    makeComponent(prefix, 'side'),
  ];
  return {
    components,
    name: components.map((c) => c.name).join(', '),
    ingredients: components.flatMap((c) => c.ingredients),
  };
}

function makeDayPlan(day: string): DayPlan {
  return {
    day,
    breakfast: makeMeal(`${day}-Bfast`, 'breakfast'),
    lunch: makeComposedMeal(`${day}-L`),
    dinner: makeComposedMeal(`${day}-D`),
  };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function makeWeeklyPlan(): WeeklyPlan {
  return DAYS.map((d) => makeDayPlan(d));
}

// --- Tests ---

describe('New ResponseType formatting (Task 5.2)', () => {
  it('CHANGE_PLAN_MENU produces non-empty text with 3 buttons', () => {
    const res: BotResponse = { type: ResponseType.CHANGE_PLAN_MENU };
    const fmt = formatBotResponse(res);
    expect(fmt.text.length).toBeGreaterThan(0);
    expect(fmt.buttons).toBeDefined();
    expect(fmt.buttons!.length).toBe(3);
    expect(fmt.buttons!.map((b) => b.id)).toEqual(
      expect.arrayContaining(['few_meals', 'entire_plan', 'change_preference']),
    );
  });

  it('FEW_MEALS_DAY_PROMPT splits 7 days into clickable button groups of ≤3', () => {
    const res: BotResponse = { type: ResponseType.FEW_MEALS_DAY_PROMPT };
    const fmt = formatBotResponse(res);
    expect(fmt.text.length).toBeGreaterThan(0);
    expect(fmt.buttons).toBeDefined();
    expect(fmt.buttons!.length).toBe(3);
    expect(fmt.followUp).toBeDefined();
    expect(fmt.followUp!.length).toBe(2);
    expect(fmt.followUp![0].buttons!.length).toBe(3);
    expect(fmt.followUp![1].buttons!.length).toBe(1);
    // Total across all messages = 7
    const totalButtons = fmt.buttons!.length
      + fmt.followUp!.reduce((sum, f) => sum + (f.buttons?.length ?? 0), 0);
    expect(totalButtons).toBe(7);
  });

  it('FEW_MEALS_SLOT_PROMPT includes day name and has 3 slot buttons', () => {
    const res: BotResponse = {
      type: ResponseType.FEW_MEALS_SLOT_PROMPT,
      data: { dayName: 'Wednesday' },
    };
    const fmt = formatBotResponse(res);
    expect(fmt.text).toContain('Wednesday');
    expect(fmt.buttons!.length).toBe(3);
    expect(fmt.buttons!.map((b) => b.id)).toEqual(
      expect.arrayContaining(['slot_breakfast', 'slot_lunch', 'slot_dinner']),
    );
  });

  it('FEW_MEALS_ALTERNATIVES shows header with day and slot', () => {
    const res: BotResponse = {
      type: ResponseType.FEW_MEALS_ALTERNATIVES,
      data: { dayName: 'Monday', oldMeal: 'lunch' },
      suggestedActions: [
        { id: 'alt_0', label: 'Paneer Tikka' },
        { id: 'alt_1', label: 'Dal Makhani' },
        { id: 'alt_2', label: 'Chole Bhature' },
      ],
    };
    const fmt = formatBotResponse(res);
    expect(fmt.text).toContain('Monday');
    expect(fmt.text).toContain('lunch');
    expect(fmt.buttons!.length).toBe(3);
  });

  it('FEW_MEALS_UPDATED produces non-empty text with done/change-more buttons', () => {
    const res: BotResponse = { type: ResponseType.FEW_MEALS_UPDATED };
    const fmt = formatBotResponse(res);
    expect(fmt.text.length).toBeGreaterThan(0);
    expect(fmt.buttons!.map((b) => b.id)).toEqual(
      expect.arrayContaining(['change_more', 'done_changing']),
    );
  });

  it('FEW_MEALS_NO_ALTERNATIVE produces non-empty text', () => {
    const res: BotResponse = { type: ResponseType.FEW_MEALS_NO_ALTERNATIVE };
    const fmt = formatBotResponse(res);
    expect(fmt.text.length).toBeGreaterThan(0);
  });

  it('ENTIRE_PLAN_PREVIEW shows plan and accept/retry buttons', () => {
    const plan = makeWeeklyPlan();
    const res: BotResponse = {
      type: ResponseType.ENTIRE_PLAN_PREVIEW,
      data: { weeklyPlan: plan },
    };
    const fmt = formatBotResponse(res);
    expect(fmt.text).toContain('Monday');
    // Buttons are on the follow-up message
    expect(fmt.followUp).toBeDefined();
    expect(fmt.followUp![0].buttons!.map((b) => b.id)).toEqual(
      expect.arrayContaining(['accept_plan', 'retry_plan']),
    );
  });

  it('ADHOC_MENU produces non-empty text with 2 menu buttons', () => {
    const res: BotResponse = { type: ResponseType.ADHOC_MENU };
    const fmt = formatBotResponse(res);
    expect(fmt.text.length).toBeGreaterThan(0);
    expect(fmt.buttons).toBeDefined();
    expect(fmt.buttons!.length).toBe(2);
    expect(fmt.buttons!.map((b) => b.id)).toEqual(
      expect.arrayContaining(['weekly_plan', 'tomorrow_plan']),
    );
  });
});

describe('Footer hint on terminal messages (Task 5.3)', () => {
  const terminalTypes: { type: ResponseType; label: string; data?: BotResponse['data'] }[] = [
    { type: ResponseType.SWAP_CONFIRMATION, label: 'SWAP_CONFIRMATION', data: { oldMeal: 'A', newMeal: 'B' } },
    { type: ResponseType.COOK_MESSAGE_SENT, label: 'COOK_MESSAGE_SENT' },
    { type: ResponseType.WEEKLY_REMINDER, label: 'WEEKLY_REMINDER' },
    { type: ResponseType.FEW_MEALS_UPDATED, label: 'FEW_MEALS_UPDATED' },
    { type: ResponseType.ADHOC_MENU, label: 'ADHOC_MENU' },
  ];

  for (const { type, label, data } of terminalTypes) {
    it(`${label} includes footer hint`, () => {
      const res: BotResponse = { type, ...(data ? { data } : {}) };
      const fmt = formatBotResponse(res);
      const hasFooterHint = fmt.text.includes('Type "hi" to start a new conversation');
      const hasDailyHint = fmt.text.includes('say "hi" anytime');
      expect(hasFooterHint || hasDailyHint).toBe(true);
    });
  }
});

describe('Footer hint NOT on non-terminal messages', () => {
  const nonTerminalTypes: { type: ResponseType; label: string }[] = [
    { type: ResponseType.ONBOARDING_CUISINE_PROMPT, label: 'ONBOARDING_CUISINE_PROMPT' },
    { type: ResponseType.ONBOARDING_DIET_PROMPT, label: 'ONBOARDING_DIET_PROMPT' },
    { type: ResponseType.ONBOARDING_STYLE_PROMPT, label: 'ONBOARDING_STYLE_PROMPT' },
    { type: ResponseType.CHANGE_PLAN_MENU, label: 'CHANGE_PLAN_MENU' },
    { type: ResponseType.FEW_MEALS_DAY_PROMPT, label: 'FEW_MEALS_DAY_PROMPT' },
    { type: ResponseType.FEW_MEALS_SLOT_PROMPT, label: 'FEW_MEALS_SLOT_PROMPT' },
    { type: ResponseType.INVALID_INPUT, label: 'INVALID_INPUT' },
  ];

  for (const { type, label } of nonTerminalTypes) {
    it(`${label} does NOT include footer hint`, () => {
      const res: BotResponse = { type };
      const fmt = formatBotResponse(res);
      expect(fmt.text).not.toContain('Type "hi" to start a new conversation');
    });
  }
});
