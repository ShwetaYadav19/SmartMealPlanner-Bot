// Response formatter — WhatsApp-specific layer
// Converts structured BotResponse objects into formatted WhatsApp messages
// All text strings sourced from the MessageCatalog (src/messages.ts) — no inline string literals

import type { BotResponse, CandidateDishes, DayPlan, GroceryItem, WeeklyPlan } from './core/types';
import { ResponseType } from './core/types';
import type { ButtonOption } from './core/ports';
import {
  ONBOARDING_WELCOME,
  ONBOARDING_CUISINE_PROMPT,
  ONBOARDING_DIET_PROMPT,
  ONBOARDING_STYLE_PROMPT,
  ONBOARDING_COMPLETE,
  MAIN_MENU_HEADER,
  WEEKLY_PLAN_HEADER,
  DAY_PLAN_HEADER,
  NO_PLAN_PROMPT,
  WEEKLY_GROCERY_HEADER,
  TOMORROW_GROCERY_HEADER,
  COOK_NUMBER_PROMPT,
  COOK_NUMBER_SAVED,
  COOK_MESSAGE_SENT,
  NO_COOK_PROMPT,
  SWAP_CONFIRMATION,
  SWAP_NO_ALTERNATIVE,
  DAILY_REMINDER_HEADER,
  WEEKLY_REMINDER,
  EXPIRED_PLAN_PROMPT,
  INVALID_INPUT,
  GENERIC_ERROR,
  INVALID_PHONE,
  COOK_NUMBER_ONBOARDING_PROMPT,
  formatDishPreviewMessage,
  DISH_REMOVED_CONFIRMATION,
  COMPONENT_REMOVED_CONFIRMATION,
  DISH_PREVIEW_EMPTY_ERROR,
  MORE_OPTIONS_MENU_HEADER,
  WEEKLY_PLAN_GROCERY_HINT,
} from './messages';

export interface FormattedMessage {
  text: string;
  buttons?: ButtonOption[];
}

const MAIN_MENU_BUTTONS: ButtonOption[] = [
  { id: 'tomorrow_plan', title: "Tomorrow's Meal Plan" },
  { id: 'tomorrow_grocery', title: "Tomorrow's Grocery" },
  { id: 'send_to_cook', title: 'Send Menu to Cook' },
  { id: 'more_options', title: 'More Options' },
];

const MORE_OPTIONS_BUTTONS: ButtonOption[] = [
  { id: 'weekly_plan', title: 'Weekly Meal Plan' },
  { id: 'weekly_grocery', title: 'View Weekly Grocery List' },
  { id: 'change_preference', title: 'Change Meal Preference' },
  { id: 'change_cook_number', title: "Change Cook's Number" },
];

const CUISINE_BUTTONS: ButtonOption[] = [
  { id: 'north_indian', title: 'North Indian' },
  { id: 'south_indian', title: 'South Indian' },
  { id: 'both', title: 'Both' },
];

const DIET_BUTTONS: ButtonOption[] = [
  { id: 'veg', title: 'Veg' },
  { id: 'non_veg', title: 'Non-Veg' },
  { id: 'both', title: 'Both' },
];

const STYLE_BUTTONS: ButtonOption[] = [
  { id: 'health', title: 'Health' },
  { id: 'regular', title: 'Regular Home Meals' },
];

const GENERATE_PLAN_BUTTON: ButtonOption[] = [
  { id: 'weekly_plan', title: 'Generate Weekly Plan' },
];

export function formatWeeklyPlan(plan: WeeklyPlan): string {
  let text = WEEKLY_PLAN_HEADER;
  for (const day of plan) {
    text += `\n*${day.day}*`;
    text += `\n🥣 Breakfast: ${day.breakfast.name}`;
    text += `\n🍛 Lunch: ${day.lunch.name}`;
    text += `\n🍽️ Dinner: ${day.dinner.name}\n`;
  }
  return text;
}

export function formatDayPlan(day: DayPlan): string {
  let text = DAY_PLAN_HEADER(day.day);
  text += `\n🥣 Breakfast: ${day.breakfast.name}`;
  text += `\n🍛 Lunch: ${day.lunch.name}`;
  text += `\n🍽️ Dinner: ${day.dinner.name}`;
  return text;
}

export function formatGroceryList(items: GroceryItem[]): string {
  const grouped = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const category = item.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(item);
  }

  let text = WEEKLY_GROCERY_HEADER;
  for (const [category, categoryItems] of grouped) {
    text += `\n*${category.charAt(0).toUpperCase() + category.slice(1)}*`;
    for (const item of categoryItems) {
      text += `\n  • ${item.name} — ${item.quantity}`;
    }
    text += '\n';
  }
  return text;
}

export function formatCookMessage(day: DayPlan): string {
  let text = `🍽️ Tomorrow's Menu (${day.day})\n`;
  text += `\n🥣 Breakfast: ${day.breakfast.name}`;
  text += `\n🍛 Lunch: ${day.lunch.name}`;
  text += `\n🍽️ Dinner: ${day.dinner.name}`;
  return text;
}

function generateComponentButtons(candidates: CandidateDishes): ButtonOption[] {
  const buttons: ButtonOption[] = [];
  for (const b of candidates.breakfasts) {
    buttons.push({ id: `remove_dish_${b.id}`, title: `❌ ${b.name}`.slice(0, 20) });
  }
  for (const slot of [candidates.lunchComponents, candidates.dinnerComponents]) {
    for (const category of ['base', 'gravy', 'dry_veggie', 'side'] as const) {
      for (const comp of slot[category]) {
        buttons.push({ id: `remove_dish_${comp.id}`, title: `❌ ${comp.name}`.slice(0, 20) });
      }
    }
  }
  buttons.push({ id: 'confirm_dishes', title: '✅ Confirm Dishes' });
  return buttons;
}

export function formatBotResponse(response: BotResponse): FormattedMessage {
  const { type, data, suggestedActions } = response;

  // Convert suggestedActions to buttons if present
  const suggestedButtons: ButtonOption[] | undefined = suggestedActions?.map((a) => ({
    id: a.id,
    title: a.label,
  }));

  switch (type) {
    case ResponseType.ONBOARDING_CUISINE_PROMPT:
      return {
        text: `${ONBOARDING_WELCOME}\n\n${ONBOARDING_CUISINE_PROMPT}`,
        buttons: suggestedButtons ?? CUISINE_BUTTONS,
      };

    case ResponseType.ONBOARDING_DIET_PROMPT:
      return {
        text: ONBOARDING_DIET_PROMPT,
        buttons: suggestedButtons ?? DIET_BUTTONS,
      };

    case ResponseType.ONBOARDING_STYLE_PROMPT:
      return {
        text: ONBOARDING_STYLE_PROMPT,
        buttons: suggestedButtons ?? STYLE_BUTTONS,
      };

    case ResponseType.ONBOARDING_COMPLETE:
      return {
        text: ONBOARDING_COMPLETE,
        buttons: MAIN_MENU_BUTTONS,
      };

    case ResponseType.MAIN_MENU:
      return {
        text: MAIN_MENU_HEADER,
        buttons: suggestedButtons ?? MAIN_MENU_BUTTONS,
      };

    case ResponseType.WEEKLY_PLAN: {
      const planText = data?.weeklyPlan ? formatWeeklyPlan(data.weeklyPlan) : WEEKLY_PLAN_HEADER;
      return {
        text: `${planText}\n\n${WEEKLY_PLAN_GROCERY_HINT}`,
        buttons: MAIN_MENU_BUTTONS,
      };
    }

    case ResponseType.WEEKLY_GROCERY_LIST: {
      const groceryText = data?.groceryList
        ? formatGroceryList(data.groceryList)
        : WEEKLY_GROCERY_HEADER;
      return {
        text: groceryText,
        buttons: MAIN_MENU_BUTTONS,
      };
    }

    case ResponseType.TOMORROW_PLAN: {
      const dayText = data?.dayPlan ? formatDayPlan(data.dayPlan) : DAY_PLAN_HEADER('');
      return {
        text: dayText,
        buttons: MAIN_MENU_BUTTONS,
      };
    }

    case ResponseType.TOMORROW_GROCERY_LIST: {
      const tomorrowGroceryText = data?.groceryList
        ? `${TOMORROW_GROCERY_HEADER}${formatGroceryListBody(data.groceryList)}`
        : TOMORROW_GROCERY_HEADER;
      return {
        text: tomorrowGroceryText,
        buttons: MAIN_MENU_BUTTONS,
      };
    }

    case ResponseType.COOK_NUMBER_PROMPT:
      return { text: COOK_NUMBER_PROMPT };

    case ResponseType.COOK_NUMBER_SAVED:
      return {
        text: COOK_NUMBER_SAVED,
        buttons: MAIN_MENU_BUTTONS,
      };

    case ResponseType.COOK_MESSAGE_SENT:
      return {
        text: COOK_MESSAGE_SENT,
        buttons: MAIN_MENU_BUTTONS,
      };

    case ResponseType.SWAP_CONFIRMATION: {
      const swapText =
        data?.oldMeal && data?.newMeal
          ? SWAP_CONFIRMATION(data.oldMeal, data.newMeal)
          : SWAP_CONFIRMATION('', '');
      return {
        text: swapText,
        buttons: MAIN_MENU_BUTTONS,
      };
    }

    case ResponseType.SWAP_NO_ALTERNATIVE:
      return {
        text: SWAP_NO_ALTERNATIVE,
        buttons: MAIN_MENU_BUTTONS,
      };

    case ResponseType.NO_PLAN_ERROR:
      return {
        text: NO_PLAN_PROMPT,
        buttons: GENERATE_PLAN_BUTTON,
      };

    case ResponseType.NO_COOK_ERROR:
      return {
        text: NO_COOK_PROMPT,
        buttons: MAIN_MENU_BUTTONS,
      };

    case ResponseType.INVALID_INPUT:
      return {
        text: INVALID_INPUT,
        buttons: suggestedButtons ?? MAIN_MENU_BUTTONS,
      };

    case ResponseType.INVALID_PHONE:
      return { text: INVALID_PHONE };

    case ResponseType.EXPIRED_PLAN_PROMPT:
      return {
        text: EXPIRED_PLAN_PROMPT,
        buttons: GENERATE_PLAN_BUTTON,
      };

    case ResponseType.DAILY_REMINDER: {
      const reminderDayText = data?.dayPlan
        ? `${DAILY_REMINDER_HEADER(data.dayPlan.day)}\n${formatDayPlanBody(data.dayPlan)}`
        : DAILY_REMINDER_HEADER('');
      return {
        text: reminderDayText,
        buttons: [
          { id: 'tomorrow_grocery', title: 'View Grocery List' },
          { id: 'swap_lunch', title: 'Swap Lunch' },
          { id: 'send_to_cook', title: 'Send to Cook' },
        ],
      };
    }

    case ResponseType.WEEKLY_REMINDER:
      return {
        text: WEEKLY_REMINDER,
        buttons: GENERATE_PLAN_BUTTON,
      };

    case ResponseType.COOK_NUMBER_ONBOARDING_PROMPT:
      return {
        text: COOK_NUMBER_ONBOARDING_PROMPT,
        buttons: [{ id: 'skip_cook', title: 'Skip' }],
      };

    case ResponseType.DISH_PREVIEW: {
      const candidates = data?.candidateDishes;
      const previewText = candidates
        ? formatDishPreviewMessage(candidates)
        : 'No dishes available';
      const dishButtons: ButtonOption[] = candidates
        ? generateComponentButtons(candidates)
        : [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }];
      return {
        text: previewText,
        buttons: dishButtons,
      };
    }

    case ResponseType.DISH_REMOVED: {
      const updatedCandidates = data?.candidateDishes;
      let confirmationText: string;
      if (data?.removedComponentName && data?.removedComponentCategory) {
        confirmationText = COMPONENT_REMOVED_CONFIRMATION(data.removedComponentName, data.removedComponentCategory);
      } else {
        const removedName = data?.removedDishName ?? '';
        const replacementName = data?.replacementDishName ?? '';
        confirmationText = DISH_REMOVED_CONFIRMATION(removedName, replacementName);
      }
      const updatedPreviewText = updatedCandidates
        ? formatDishPreviewMessage(updatedCandidates)
        : '';
      const updatedDishButtons: ButtonOption[] = updatedCandidates
        ? generateComponentButtons(updatedCandidates)
        : [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }];
      return {
        text: `${confirmationText}\n\n${updatedPreviewText}`,
        buttons: updatedDishButtons,
      };
    }

    case ResponseType.DISH_PREVIEW_EMPTY_ERROR: {
      const originalCandidates = data?.candidateDishes;
      const originalPreviewText = originalCandidates
        ? formatDishPreviewMessage(originalCandidates)
        : '';
      const errorDishButtons: ButtonOption[] = originalCandidates
        ? generateComponentButtons(originalCandidates)
        : [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }];
      return {
        text: `${DISH_PREVIEW_EMPTY_ERROR}\n\n${originalPreviewText}`,
        buttons: errorDishButtons,
      };
    }

    case ResponseType.MORE_OPTIONS_MENU:
      return {
        text: MORE_OPTIONS_MENU_HEADER,
        buttons: MORE_OPTIONS_BUTTONS,
      };

    case ResponseType.ERROR:
      return { text: GENERIC_ERROR, buttons: MAIN_MENU_BUTTONS };

    default:
      return { text: GENERIC_ERROR };
  }
}

// Internal helper: format grocery list body without header
function formatGroceryListBody(items: GroceryItem[]): string {
  const grouped = new Map<string, GroceryItem[]>();
  for (const item of items) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, []);
    }
    grouped.get(item.category)!.push(item);
  }

  let text = '';
  for (const [category, categoryItems] of grouped) {
    text += `\n*${category.charAt(0).toUpperCase() + category.slice(1)}*`;
    for (const item of categoryItems) {
      text += `\n  • ${item.name} — ${item.quantity}`;
    }
    text += '\n';
  }
  return text;
}

// Internal helper: format day plan body without header
function formatDayPlanBody(day: DayPlan): string {
  let text = `🥣 Breakfast: ${day.breakfast.name}`;
  text += `\n🍛 Lunch: ${day.lunch.name}`;
  text += `\n🍽️ Dinner: ${day.dinner.name}`;
  return text;
}
