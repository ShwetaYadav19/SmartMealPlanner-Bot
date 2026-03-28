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
  ONBOARDING_MEAL_FORMAT_PROMPT,
  ONBOARDING_LUNCH_FORMAT_PROMPT,
  ONBOARDING_DINNER_FORMAT_PROMPT,
  ONBOARDING_COMPLETE,
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
  WEEKLY_REMINDER_PLAN_HEADER,
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
  PLAN_APPROVAL_PROMPT,
  HAPPY_WITH_MENU_PROMPT,
  WEEKLY_PLAN_FIRST_TIME_HEADER,
  CHANGE_PLAN_MENU_HEADER,
  FEW_MEALS_DAY_PROMPT,
  FEW_MEALS_SLOT_PROMPT,
  FEW_MEALS_ALTERNATIVES_HEADER,
  FEW_MEALS_UPDATED,
  FEW_MEALS_NO_ALTERNATIVE_MSG,
  ENTIRE_PLAN_PREVIEW_HEADER,
  ADHOC_MENU_HEADER,
  FOOTER_HINT,
  DAILY_REMINDER_HINT,
  PAYMENT_PROMPT,
  PAYMENT_PENDING_MSG,
  PAYMENT_SUCCESS_MSG,
} from './messages';

export interface FormattedMessage {
  text: string;
  buttons?: ButtonOption[];
  listItems?: ListItem[];
  listButtonLabel?: string;
  /** Additional messages to send after the primary one (e.g. plan text + separate CTA) */
  followUp?: FormattedMessage[];
}

const PLAN_APPROVAL_BUTTONS: ButtonOption[] = [
  { id: 'happy_with_menu', title: 'Happy with the menu' },
  { id: 'change_plan', title: 'Want to change' },
];

const HAPPY_MENU_BUTTONS: ButtonOption[] = [
  { id: 'tomorrow_plan', title: "What's for tomorrow?" },
  { id: 'weekly_grocery', title: 'Get weekly grocery list' },
];

const TOMORROW_PLAN_BUTTONS: ButtonOption[] = [
  { id: 'tomorrow_grocery', title: "Tomorrow's Grocery List" },
  { id: 'send_to_cook', title: 'Send to Cook' },
];

const CUISINE_BUTTONS: ButtonOption[] = [
  { id: 'north_indian', title: 'North Indian' },
  { id: 'south_indian', title: 'South Indian' },
  { id: 'both', title: 'Both' },
];

const DIET_BUTTONS: ButtonOption[] = [
  { id: 'veg', title: 'Veg' },
  { id: 'non_veg', title: 'Non-Veg' },
  { id: 'veg_with_eggs', title: 'Veg + Eggs' },
];

const STYLE_BUTTONS: ButtonOption[] = [
  { id: 'health', title: 'Health' },
  { id: 'regular', title: 'Regular Home Meals' },
];

const MEAL_FORMAT_BUTTONS: ButtonOption[] = [
  { id: 'light', title: '🍚 Light' },
  { id: 'regular_format', title: '🏠 Regular' },
  { id: 'full_thali_preset', title: '🍛 Full Thali' },
];

const SLOT_FORMAT_BUTTONS: ButtonOption[] = [
  { id: 'quick_meal', title: '🍚 Quick Meal' },
  { id: 'home_meal', title: '🏠 Home Meal' },
  { id: 'full_thali', title: '🍛 Full Thali' },
];

const GENERATE_PLAN_BUTTON: ButtonOption[] = [
  { id: 'weekly_plan', title: 'Generate Weekly Plan' },
];

const CHANGE_PLAN_BUTTONS: ButtonOption[] = [
  { id: 'few_meals', title: 'Change a Few Meals' },
  { id: 'entire_plan', title: 'Regenerate Plan' },
];

const DAY_BUTTONS: ButtonOption[] = [
  { id: 'day_0', title: 'Monday' },
  { id: 'day_1', title: 'Tuesday' },
  { id: 'day_2', title: 'Wednesday' },
  { id: 'day_3', title: 'Thursday' },
  { id: 'day_4', title: 'Friday' },
  { id: 'day_5', title: 'Saturday' },
  { id: 'day_6', title: 'Sunday' },
];

const SLOT_BUTTONS: ButtonOption[] = [
  { id: 'slot_breakfast', title: 'Breakfast' },
  { id: 'slot_lunch', title: 'Lunch' },
  { id: 'slot_dinner', title: 'Dinner' },
];

const FEW_MEALS_DONE_BUTTONS: ButtonOption[] = [
  { id: 'change_more', title: 'Change More Meals' },
  { id: 'done_changing', title: 'Done' },
];

const ENTIRE_PLAN_BUTTONS: ButtonOption[] = [
  { id: 'accept_plan', title: 'Accept' },
  { id: 'retry_plan', title: 'Try Again' },
];

const ADHOC_MENU_BUTTONS: ButtonOption[] = [
  { id: 'weekly_plan', title: 'Weekly Meal Plan' },
  { id: 'tomorrow_plan', title: "Tomorrow's Plan" },
];

export function formatWeeklyPlan(plan: WeeklyPlan): string {
  const days = plan.map((day) =>
    `*${day.day}*\n🥣 ${day.breakfast.name}\n🍛 ${day.lunch.name}\n🍽️ ${day.dinner.name}`
  );
  return `${WEEKLY_PLAN_HEADER}\n${days.join('\n\n')}`;
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
      text += `\n  • ${item.name}`;
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
  const MAX_LIST_ITEMS = 20; // Numbered text supports more than WhatsApp list-picker's 10

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

    case ResponseType.ONBOARDING_MEAL_FORMAT_PROMPT:
      return {
        text: ONBOARDING_MEAL_FORMAT_PROMPT,
        buttons: suggestedButtons ?? MEAL_FORMAT_BUTTONS,
      };

    case ResponseType.ONBOARDING_LUNCH_FORMAT_PROMPT:
      return {
        text: ONBOARDING_LUNCH_FORMAT_PROMPT,
        buttons: suggestedButtons ?? SLOT_FORMAT_BUTTONS,
      };

    case ResponseType.ONBOARDING_DINNER_FORMAT_PROMPT:
      return {
        text: ONBOARDING_DINNER_FORMAT_PROMPT,
        buttons: suggestedButtons ?? SLOT_FORMAT_BUTTONS,
      };

    case ResponseType.ONBOARDING_COMPLETE:
      return {
        text: ONBOARDING_COMPLETE,
        buttons: ADHOC_MENU_BUTTONS,
      };

    case ResponseType.WEEKLY_PLAN: {
      const planText = data?.weeklyPlan ? formatWeeklyPlan(data.weeklyPlan) : WEEKLY_PLAN_HEADER;
      return {
        text: planText,
        followUp: [{
          text: PLAN_APPROVAL_PROMPT,
          buttons: PLAN_APPROVAL_BUTTONS,
        }],
      };
    }

    case ResponseType.WEEKLY_GROCERY_LIST: {
      const groceryText = data?.groceryList
        ? formatGroceryList(data.groceryList)
        : WEEKLY_GROCERY_HEADER;

      return {
        text: groceryText,
        followUp: [{
          text: 'Would you like to see tomorrow\'s plan? 🍽️',
          buttons: [
            { id: 'happy_daily_yes', title: 'Yes 🍽️' },
            { id: 'happy_daily_no', title: 'No ❌' },
          ],
        }],
      };
    }

    case ResponseType.TOMORROW_PLAN: {
      const dayText = data?.dayPlan ? formatDayPlan(data.dayPlan) : DAY_PLAN_HEADER('');
      return {
        text: dayText,
        buttons: TOMORROW_PLAN_BUTTONS,
      };
    }

    case ResponseType.TOMORROW_GROCERY_LIST: {
      const tomorrowGroceryText = data?.groceryList
        ? `${TOMORROW_GROCERY_HEADER}${formatGroceryListBody(data.groceryList)}`
        : TOMORROW_GROCERY_HEADER;
      return {
        text: tomorrowGroceryText,
        followUp: [{
          text: 'Want to send tomorrow\'s menu to your cook? 👨‍🍳',
          buttons: [
            { id: 'daily_cook_yes', title: 'Yes 📤' },
            { id: 'daily_cook_no', title: 'No ❌' },
          ],
        }],
      };
    }

    case ResponseType.COOK_NUMBER_PROMPT:
      return { text: COOK_NUMBER_PROMPT };

    case ResponseType.COOK_NUMBER_SAVED:
      return {
        text: `${COOK_NUMBER_SAVED}${DAILY_REMINDER_HINT}`,
      };

    case ResponseType.COOK_MESSAGE_SENT:
      return {
        text: `${COOK_MESSAGE_SENT}${DAILY_REMINDER_HINT}`,
      };

    case ResponseType.SWAP_CONFIRMATION: {
      const swapText =
        data?.oldMeal && data?.newMeal
          ? SWAP_CONFIRMATION(data.oldMeal, data.newMeal)
          : SWAP_CONFIRMATION('', '');
      return {
        text: `${swapText}${FOOTER_HINT}`,
        buttons: ADHOC_MENU_BUTTONS,
      };
    }

    case ResponseType.SWAP_NO_ALTERNATIVE:
      return {
        text: SWAP_NO_ALTERNATIVE,
        buttons: ADHOC_MENU_BUTTONS,
      };

    case ResponseType.NO_PLAN_ERROR:
      return {
        text: NO_PLAN_PROMPT,
        buttons: GENERATE_PLAN_BUTTON,
      };

    case ResponseType.NO_COOK_ERROR:
      return {
        text: NO_COOK_PROMPT,
        buttons: ADHOC_MENU_BUTTONS,
      };

    case ResponseType.INVALID_INPUT:
      return {
        text: INVALID_INPUT,
        buttons: suggestedButtons ?? ADHOC_MENU_BUTTONS,
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
        text: `${reminderDayText}\n\nWould you like to see tomorrow's grocery list? 🛒`,
        buttons: [
          { id: 'daily_grocery_yes', title: 'Yes 🛒' },
          { id: 'daily_grocery_no', title: 'No ❌' },
        ],
      };
    }

    case ResponseType.WEEKLY_REMINDER: {
      if (data?.weeklyPlan) {
        const planText = formatWeeklyPlan(data.weeklyPlan);
        const headerText = WEEKLY_REMINDER_PLAN_HEADER;
        return {
          text: `${headerText}\n${planText}`,
          followUp: [{
            text: PLAN_APPROVAL_PROMPT,
            buttons: PLAN_APPROVAL_BUTTONS,
          }],
        };
      }
      return {
        text: `${WEEKLY_REMINDER}${FOOTER_HINT}`,
        buttons: GENERATE_PLAN_BUTTON,
      };
    }

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

    case ResponseType.CHANGE_PLAN_MENU:
      return {
        text: CHANGE_PLAN_MENU_HEADER,
        buttons: suggestedButtons ?? CHANGE_PLAN_BUTTONS,
      };

    case ResponseType.REGENERATE_PLAN_MENU:
      return {
        text: 'Would you like to keep your current preferences or change them? 🔄',
        buttons: [
          { id: 'keep_preferences', title: 'Keep Preferences' },
          { id: 'change_preference', title: 'Change Preferences' },
        ],
      };

    case ResponseType.FEW_MEALS_DAY_PROMPT: {
      const dayBtns = suggestedButtons ?? DAY_BUTTONS;
      // WhatsApp allows max 3 buttons per message — split days across messages
      const dayChunks: ButtonOption[][] = [];
      for (let i = 0; i < dayBtns.length; i += 3) {
        dayChunks.push(dayBtns.slice(i, i + 3));
      }
      return {
        text: FEW_MEALS_DAY_PROMPT,
        buttons: dayChunks[0],
        followUp: dayChunks.slice(1).map((chunk) => ({
          text: '📅',
          buttons: chunk,
        })),
      };
    }

    case ResponseType.FEW_MEALS_SLOT_PROMPT: {
      const slotDayName = data?.dayName ?? '';
      return {
        text: FEW_MEALS_SLOT_PROMPT(slotDayName),
        buttons: suggestedButtons ?? SLOT_BUTTONS,
      };
    }

    case ResponseType.FEW_MEALS_ALTERNATIVES: {
      const altDayName = data?.dayName ?? '';
      const altSlot = data?.oldMeal ?? '';
      const alternatives = response.suggestedActions ?? [];
      const altButtons: ButtonOption[] = alternatives.map((a) => ({
        id: a.id,
        title: a.label,
      }));
      return {
        text: FEW_MEALS_ALTERNATIVES_HEADER(altDayName, altSlot),
        buttons: altButtons.length > 0 ? altButtons : suggestedButtons,
      };
    }

    case ResponseType.FEW_MEALS_UPDATED:
      return {
        text: `${FEW_MEALS_UPDATED}${FOOTER_HINT}`,
        buttons: FEW_MEALS_DONE_BUTTONS,
      };

    case ResponseType.FEW_MEALS_NO_ALTERNATIVE: {
      const noAltDayBtns = suggestedButtons ?? DAY_BUTTONS;
      const noAltChunks: ButtonOption[][] = [];
      for (let i = 0; i < noAltDayBtns.length; i += 3) {
        noAltChunks.push(noAltDayBtns.slice(i, i + 3));
      }
      return {
        text: FEW_MEALS_NO_ALTERNATIVE_MSG,
        buttons: noAltChunks[0],
        followUp: noAltChunks.slice(1).map((chunk) => ({
          text: '📅',
          buttons: chunk,
        })),
      };
    }

    case ResponseType.ENTIRE_PLAN_PREVIEW: {
      const previewPlanText = data?.weeklyPlan ? formatWeeklyPlan(data.weeklyPlan) : WEEKLY_PLAN_HEADER;
      return {
        text: `${ENTIRE_PLAN_PREVIEW_HEADER}\n\n${previewPlanText}`,
        followUp: [{
          text: 'Would you like to accept this plan or try again?',
          buttons: suggestedButtons ?? ENTIRE_PLAN_BUTTONS,
        }],
      };
    }

    case ResponseType.HAPPY_MENU:
      return {
        text: HAPPY_WITH_MENU_PROMPT,
        buttons: suggestedButtons ?? HAPPY_MENU_BUTTONS,
      };

    case ResponseType.ADHOC_MENU:
      return {
        text: `${ADHOC_MENU_HEADER}${FOOTER_HINT}`,
        buttons: suggestedButtons ?? ADHOC_MENU_BUTTONS,
      };

    case ResponseType.HAPPY_GROCERY_PROMPT:
      return {
        text: `${HAPPY_WITH_MENU_PROMPT}\n\nWould you like to see the weekly grocery list? 🛒`,
        buttons: [
          { id: 'happy_grocery_yes', title: 'Yes 🛒' },
          { id: 'happy_grocery_no', title: 'No ❌' },
        ],
      };

    case ResponseType.HAPPY_DAILY_PROMPT:
      return {
        text: 'Would you like to see tomorrow\'s plan? 🍽️',
        buttons: [
          { id: 'happy_daily_yes', title: 'Yes 🍽️' },
          { id: 'happy_daily_no', title: 'No ❌' },
        ],
      };

    case ResponseType.DAILY_COOK_PROMPT:
      return {
        text: 'Would you like to send tomorrow\'s menu to your cook? 👨‍🍳',
        buttons: [
          { id: 'daily_cook_yes', title: 'Yes 📤' },
          { id: 'daily_cook_no', title: 'No ❌' },
        ],
      };

    case ResponseType.DAILY_FLOW_DONE:
      return {
        text: DAILY_REMINDER_HINT.trim(),
      };

    case ResponseType.ERROR:
      return { text: GENERIC_ERROR, buttons: ADHOC_MENU_BUTTONS };

    case ResponseType.PAYMENT_PROMPT: {
      const paymentLink = data?.paymentLink;
      return {
        text: PAYMENT_PROMPT(paymentLink),
        buttons: [{ id: 'check_payment', title: "I've Paid ✅" }],
      };
    }

    case ResponseType.PAYMENT_PENDING:
      return {
        text: PAYMENT_PENDING_MSG,
        buttons: [{ id: 'check_payment', title: "I've Paid ✅" }],
      };

    case ResponseType.PAYMENT_SUCCESS:
      return {
        text: PAYMENT_SUCCESS_MSG,
        buttons: ADHOC_MENU_BUTTONS,
      };

    case ResponseType.SUBSCRIPTION_EXPIRED:
      return {
        text: '⚠️ Your subscription has expired. Please renew to continue using SmartMealPlanner.\n\nSubscribe for just *₹49/month* with UPI AutoPay.',
        buttons: [{ id: 'check_payment', title: 'Renew ✅' }],
      };

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
      text += `\n  • ${item.name}`;
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
