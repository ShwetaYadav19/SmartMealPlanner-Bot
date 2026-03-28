// Message catalog — all user-facing text strings for WhatsApp delivery channel
// This file is WhatsApp-specific (emojis, WhatsApp formatting) and lives outside src/core/
// A future mobile app would have its own message catalog or use structured response data directly

// --- Onboarding ---
export const ONBOARDING_WELCOME = `Hey there! 👋 Welcome to SmartMealPlanner!\nLet's set up your preferences so I can plan delicious meals for you 🍽️`;
export const ONBOARDING_CUISINE_PROMPT = `What cuisine do you prefer? 🍛`;
export const ONBOARDING_DIET_PROMPT = `Great choice! Now, what's your diet preference? 🥗`;
export const ONBOARDING_STYLE_PROMPT = `Almost done! What style of meals do you like? 🏠`;
export const ONBOARDING_MEAL_FORMAT_PROMPT = `How much would you like on your plate? 🍽️

🍚 *Light* — Dal/curry + rice/roti
🏠 *Regular* — Lunch with sabzi, lighter dinner
🍛 *Full Thali* — Curry, sabzi, side & rice/roti`;
export const ONBOARDING_LUNCH_FORMAT_PROMPT = `What would you like for lunch? 🍽️`;
export const ONBOARDING_DINNER_FORMAT_PROMPT = `And for dinner? 🌙`;
export const ONBOARDING_COMPLETE = `You're all set! 🎉 Here's what you can do:`;

// --- Plan ---
export const WEEKLY_PLAN_HEADER = `Here's your meal plan for the week 🍽️\n`;
export const WEEKLY_PLAN_FIRST_TIME_HEADER = `Here's your first meal plan 🎉🍽️\n`;
export const DAY_PLAN_HEADER = (dayName: string) => `Tomorrow's meals (${dayName}) 🌅\n`;
export const NO_PLAN_PROMPT = `You don't have a meal plan yet! Let's generate one first 📋`;

// --- Grocery ---
export const WEEKLY_GROCERY_HEADER = `Here's your grocery list for the week 🛒\n`;
export const TOMORROW_GROCERY_HEADER = `Here's what you need for tomorrow 🛒\n`;

// --- Cook ---
export const COOK_NUMBER_PROMPT = `Please enter your cook's WhatsApp number with country code (e.g., +91XXXXXXXXXX) 📱`;
export const COOK_NUMBER_SAVED = `Cook's number saved successfully ✅\n\n💡 You can update your cook's number anytime — just type "change cook".`;
export const COOK_MESSAGE_SENT = `Tomorrow's menu has been sent to your cook 👨‍🍳`;
export const NO_COOK_PROMPT = `Please save your cook's number first 📱\nType 7 or "Save Cook's Number" to add it.`;

// --- Swap ---
export const SWAP_CONFIRMATION = (oldMeal: string, newMeal: string) =>
  `Swapped! 🔄\n${oldMeal} ➡️ ${newMeal}`;
export const SWAP_NO_ALTERNATIVE = `Sorry, no alternative lunch is available right now 😕`;

// --- Reminders ---
export const DAILY_REMINDER_HEADER = (dayName: string) =>
  `Hey! Here's your meal plan for tomorrow (${dayName}) 🍽️\n`;
export const WEEKLY_REMINDER = `Hey! 🍽️ Time to plan your meals for the week ahead!`;
export const WEEKLY_REMINDER_PLAN_HEADER = `Hey! Here's your meal plan for the coming week 🍽️\n`;
export const EXPIRED_PLAN_PROMPT = `Your meal plan has expired. Let's generate a fresh one! 📋`;

// --- Errors ---
export const INVALID_INPUT = `Please select one of the options below 👇`;
export const GENERIC_ERROR = `Something went wrong, please try again 🙏`;
export const INVALID_PHONE = `Please enter a valid WhatsApp number with country code (e.g., +91XXXXXXXXXX) 📱`;

// --- Payment ---
export const PAYMENT_PROMPT = (paymentLink?: string) => {
  let text = `🎉 Great, your preferences are saved!\n\nTo unlock your personalized weekly meal plans, subscribe for just *₹49/month* with UPI AutoPay.\n`;
  if (paymentLink) {
    text += `\n👉 Pay here: ${paymentLink}\n`;
  }
  text += `\nAfter payment, tap *"I've Paid"* to get your first meal plan! 🍽️`;
  return text;
};
export const PAYMENT_PENDING_MSG = `⏳ Payment not received yet.\n\nPlease complete the payment using the link above, then tap *"I've Paid"* to continue.`;
export const PAYMENT_SUCCESS_MSG = `✅ Payment successful! Your subscription is now active.\nLet's generate your first meal plan! 🎉`;

// --- Cook Number Onboarding ---
export const COOK_NUMBER_ONBOARDING_PROMPT = `Would you like to add your cook's WhatsApp number? 👨‍🍳\nThis lets you send meal plans directly to your cook.\n\nEnter the number with country code (e.g., +91XXXXXXXXXX) or tap Skip to continue.`;
export const COOK_NUMBER_SKIP_BUTTON = `Skip`;

// --- Dish Preview ---

import type { ComponentsByCategory } from './core/types';

const CATEGORY_HEADINGS: Record<string, string> = {
  base: '*🍚 Base*',
  gravy: '*🍛 Gravy*',
  dry_veggie: '*🥗 Dry Veggie*',
  side: '*🥣 Side*',
};

const CATEGORY_LABELS: Record<string, string> = {
  base: 'Base',
  gravy: 'Gravy',
  dry_veggie: 'Dry Veggie',
  side: 'Side',
};

function formatComponentsByCategory(components: { base: { name: string }[]; gravy: { name: string }[]; dry_veggie: { name: string }[]; side: { name: string }[] }): string {
  let text = '';
  for (const category of ['base', 'gravy', 'dry_veggie', 'side'] as const) {
    const items = components[category];
    if (items.length > 0) {
      text += `\n${CATEGORY_HEADINGS[category]}`;
      for (const item of items) {
        text += `\n  • ${item.name}`;
      }
    }
  }
  return text;
}

export function formatDishPreviewMessage(candidates: {
  breakfasts: { name: string }[];
  lunchComponents: { base: { name: string }[]; gravy: { name: string }[]; dry_veggie: { name: string }[]; side: { name: string }[] };
  dinnerComponents: { base: { name: string }[]; gravy: { name: string }[]; dry_veggie: { name: string }[]; side: { name: string }[] };
}): string {
  let text = `Here are your dishes for the week 🍽️\nTap a dish to remove it.\n`;
  text += `\n*Breakfasts*`;
  for (const b of candidates.breakfasts) {
    text += `\n  • ${b.name}`;
  }
  text += `\n\n*Lunches*`;
  text += formatComponentsByCategory(candidates.lunchComponents);
  text += `\n\n*Dinners*`;
  text += formatComponentsByCategory(candidates.dinnerComponents);
  return text;
}

export function formatBreakfastStepMessage(breakfasts: { name: string }[]): string {
  let text = `🍽️ Let's review your dishes!\n\n*Step 1/5: Breakfasts*\nRemove any you don't want:`;
  for (const b of breakfasts) {
    text += `\n  • ${b.name}`;
  }
  return text;
}

export function formatCategoryStepMessage(
  category: 'base' | 'gravy' | 'dry_veggie' | 'side',
  _lunchComponents: ComponentsByCategory,
  _dinnerComponents: ComponentsByCategory,
): string {
  const stepNumbers: Record<string, number> = { base: 2, gravy: 3, dry_veggie: 4, side: 5 };
  const stepNum = stepNumbers[category];
  const label = CATEGORY_LABELS[category];

  // Keep text short — the webhook handler appends a numbered list of removable items
  return `*Step ${stepNum}/5: ${label}*\nRemove any you don't want:`;
}

export function formatConfirmStepMessage(candidates: {
  breakfasts: { name: string }[];
  lunchComponents: { base: { name: string }[]; gravy: { name: string }[]; dry_veggie: { name: string }[]; side: { name: string }[] };
  dinnerComponents: { base: { name: string }[]; gravy: { name: string }[]; dry_veggie: { name: string }[]; side: { name: string }[] };
}): string {
  const lunchCount = candidates.lunchComponents.base.length
    + candidates.lunchComponents.gravy.length
    + candidates.lunchComponents.dry_veggie.length
    + candidates.lunchComponents.side.length;
  const dinnerCount = candidates.dinnerComponents.base.length
    + candidates.dinnerComponents.gravy.length
    + candidates.dinnerComponents.dry_veggie.length
    + candidates.dinnerComponents.side.length;

  let text = `✅ *Review & Confirm*\n`;
  text += `\n🍳 *${candidates.breakfasts.length} Breakfasts:* ${candidates.breakfasts.map(b => b.name).join(', ')}`;
  text += `\n🍛 *${lunchCount} Lunch items* across base, gravy, dry veggie & side`;
  text += `\n🍽️ *${dinnerCount} Dinner items* across base, gravy, dry veggie & side`;
  text += `\n\nTap Confirm to generate your weekly meal plan!`;
  return text;
}

export const DISH_REMOVED_CONFIRMATION = (removedDishName: string, replacementDishName: string) =>
  `Removed *${removedDishName}* 🔄 Replaced with *${replacementDishName}*`;

export const COMPONENT_REMOVED_CONFIRMATION = (name: string, category: string) =>
  `Removed *${name}* from ${category} 🔄`;


export const DISH_PREVIEW_EMPTY_ERROR = `You need at least one dish per meal slot to generate a plan 🍽️\nPlease keep at least one breakfast, one lunch, and one dinner.`;

// --- Plan Approval CTA ---
export const PLAN_APPROVAL_PROMPT = `What do you think? 😊`;
export const HAPPY_WITH_MENU_PROMPT = `Great! What would you like to do next? 🎉`;

// --- Change Plan Flow ---
export const CHANGE_PLAN_MENU_HEADER = `How would you like to change your plan? 🔄`;
export const FEW_MEALS_DAY_PROMPT = `Which day would you like to change? 📅`;
export const FEW_MEALS_SLOT_PROMPT = (dayName: string) => `Which meal on ${dayName} would you like to change? 🍽️`;
export const FEW_MEALS_ALTERNATIVES_HEADER = (dayName: string, slot: string) =>
  `Here are 3 alternatives for ${dayName} ${slot} 🔄\nPick one:`;
export const FEW_MEALS_UPDATED = `Meal updated! ✅\nWould you like to change more meals?`;
export const FEW_MEALS_NO_ALTERNATIVE_MSG = `Sorry, no alternatives are available for this slot 😕`;

// --- Entire Plan Flow ---
export const ENTIRE_PLAN_PREVIEW_HEADER = `Here's your new meal plan 🍽️\nWould you like to accept or try again?`;

// --- Adhoc Menu ---
export const ADHOC_MENU_HEADER = `Hey! 👋 What would you like to do?`;

// --- Footer Hint ---
export const FOOTER_HINT = `\nType "hi" to start a new conversation`;

// --- Terminal Flow Hint ---
export const DAILY_REMINDER_HINT = `\n\n💡 I'll ping you every day at 8 PM with the next day's menu. Just say "hi" anytime if you want to chat or change things up!`;


// --- Twilio WhatsApp Content Template SID Mapping ---

// --- Twilio WhatsApp Content Template SID Mapping ---
// Only out-of-session messages (reminders) need pre-approved templates.
// In-session messages use on-the-fly quick-reply templates via the Content API.

export type TemplatePurpose =
  | 'daily_reminder'
  | 'weekly_reminder'
  | 'expired_plan';

const DEFAULT_TEMPLATE_SIDS: Record<TemplatePurpose, string> = {
  daily_reminder: 'HX0d01883256a89f9f413508b579a56436',
  weekly_reminder: '',  // Set via env var after WhatsApp approval
  expired_plan: '',     // Set via env var after WhatsApp approval
};

const ENV_VAR_MAP: Record<TemplatePurpose, string> = {
  daily_reminder: 'TWILIO_TEMPLATE_SID_DAILY_REMINDER',
  weekly_reminder: 'TWILIO_TEMPLATE_SID_WEEKLY_REMINDER',
  expired_plan: 'TWILIO_TEMPLATE_SID_EXPIRED_PLAN',
};

export function getTemplateSid(purpose: TemplatePurpose): string | undefined {
  const envVar = ENV_VAR_MAP[purpose];
  const sid = process.env[envVar] || DEFAULT_TEMPLATE_SIDS[purpose];
  return sid || undefined;
}
