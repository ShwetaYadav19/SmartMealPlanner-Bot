// Response formatter — WhatsApp-specific layer
// Converts structured BotResponse objects into formatted WhatsApp messages
// All text strings sourced from the MessageCatalog (src/messages.ts) — no inline string literals

import type { BotResponse, CandidateDishes, ComponentsByCategory, DayPlan, GroceryItem, PreviewStep, WeeklyPlan } from './core/types';
import { ResponseType } from './core/types';
import type { ButtonOption, ListItem } from './core/ports';
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
  formatBreakfastStepMessage,
  formatCategoryStepMessage,
  formatConfirmStepMessage,
  DISH_REMOVED_CONFIRMATION,
  COMPONENT_REMOVED_CONFIRMATION,
  DISH_PREVIEW_EMPTY_ERROR,
  MORE_OPTIONS_MENU_HEADER,
  WEEKLY_PLAN_GROCERY_HINT,
} from './messages';

export interface FormattedMessage {
  text: string;
  buttons?: ButtonOption[];
  listItems?: ListItem[];
  listButtonLabel?: string;
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

function generateStepListItems(candidates: CandidateDishes, step: PreviewStep): ListItem[] {
  const items: ListItem[] = [];
  const MAX_LIST_ITEMS = 10; // WhatsApp list-picker limit

  switch (step) {
    case 'breakfast':
      for (const b of candidates.breakfasts) {
        if (items.length >= MAX_LIST_ITEMS) break;
        items.push({ id: `remove_dish_${b.id}`, item: b.name.slice(0, 24), description: 'Tap to remove' });
      }
      break;

    case 'base':
    case 'gravy':
    case 'dry_veggie':
    case 'side': {
      const lunchItems = candidates.lunchComponents[step];
      const dinnerItems = candidates.dinnerComponents[step];
      const seen = new Set<string>();
      for (const comp of [...lunchItems, ...dinnerItems]) {
        if (items.length >= MAX_LIST_ITEMS) break;
        if (!seen.has(comp.id)) {
          seen.add(comp.id);
          items.push({ id: `remove_dish_${comp.id}`, item: comp.name.slice(0, 24), description: 'Tap to remove' });
        }
      }
      break;
    }

    default:
      break;
  }

  return items;
}

function generateStepButtons(candidates: CandidateDishes, step: PreviewStep): ButtonOption[] {
  switch (step) {
    case 'breakfast':
    case 'base':
    case 'gravy':
    case 'dry_veggie':
    case 'side':
      return [{ id: 'next_category', title: 'Next ➡️' }];

    case 'confirm':
      return [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }];

    default:
      return [];
  }
}

function formatStepText(candidates: CandidateDishes, step: PreviewStep): string {
  switch (step) {
    case 'breakfast':
      return formatBreakfastStepMessage(candidates.breakfasts);
    case 'base':
    case 'gravy':
    case 'dry_veggie':
    case 'side':
      return formatCategoryStepMessage(step, candidates.lunchComponents, candidates.dinnerComponents);
    case 'confirm':
      return formatConfirmStepMessage(candidates);
    default:
      return formatDishPreviewMessage(candidates);
  }
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
      const step = data?.previewStep ?? 'breakfast';
      if (!candidates) {
        return { text: 'No dishes available', buttons: [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }] };
      }
      const listItems = generateStepListItems(candidates, step);
      return {
        text: formatStepText(candidates, step),
        buttons: generateStepButtons(candidates, step),
        ...(listItems.length > 0 ? { listItems, listButtonLabel: '🗑️ Remove items' } : {}),
      };
    }

    case ResponseType.DISH_REMOVED: {
      const updatedCandidates = data?.candidateDishes;
      const removedStep = data?.previewStep ?? 'breakfast';
      let confirmationText: string;
      if (data?.removedComponentName && data?.removedComponentCategory) {
        confirmationText = COMPONENT_REMOVED_CONFIRMATION(data.removedComponentName, data.removedComponentCategory);
      } else {
        const removedName = data?.removedDishName ?? '';
        const replacementName = data?.replacementDishName ?? '';
        confirmationText = DISH_REMOVED_CONFIRMATION(removedName, replacementName);
      }
      if (!updatedCandidates) {
        return { text: confirmationText, buttons: [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }] };
      }
      const updatedPreviewText = formatStepText(updatedCandidates, removedStep);
      const removedListItems = generateStepListItems(updatedCandidates, removedStep);
      return {
        text: `${confirmationText}\n\n${updatedPreviewText}`,
        buttons: generateStepButtons(updatedCandidates, removedStep),
        ...(removedListItems.length > 0 ? { listItems: removedListItems, listButtonLabel: '🗑️ Remove items' } : {}),
      };
    }

    case ResponseType.DISH_PREVIEW_EMPTY_ERROR: {
      const originalCandidates = data?.candidateDishes;
      const errorStep = data?.previewStep ?? 'breakfast';
      if (!originalCandidates) {
        return { text: DISH_PREVIEW_EMPTY_ERROR, buttons: [{ id: 'confirm_dishes', title: '✅ Confirm Dishes' }] };
      }
      const originalPreviewText = formatStepText(originalCandidates, errorStep);
      const errorListItems = generateStepListItems(originalCandidates, errorStep);
      return {
        text: `${DISH_PREVIEW_EMPTY_ERROR}\n\n${originalPreviewText}`,
        buttons: generateStepButtons(originalCandidates, errorStep),
        ...(errorListItems.length > 0 ? { listItems: errorListItems, listButtonLabel: '🗑️ Remove items' } : {}),
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
