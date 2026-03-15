// Message catalog — all user-facing text strings for WhatsApp delivery channel
// This file is WhatsApp-specific (emojis, WhatsApp formatting) and lives outside src/core/
// A future mobile app would have its own message catalog or use structured response data directly

// --- Onboarding ---
export const ONBOARDING_WELCOME = `Hey there! 👋 Welcome to SmartMealPlanner!\nLet's set up your preferences so I can plan delicious meals for you 🍽️`;
export const ONBOARDING_CUISINE_PROMPT = `What cuisine do you prefer? 🍛`;
export const ONBOARDING_DIET_PROMPT = `Great choice! Now, what's your diet preference? 🥗`;
export const ONBOARDING_STYLE_PROMPT = `Almost done! What style of meals do you like? 🏠`;
export const ONBOARDING_COMPLETE = `You're all set! 🎉 Here's what you can do:`;

// --- Main Menu ---
export const MAIN_MENU_HEADER = `What would you like to do? 😊`;

// --- Plan ---
export const WEEKLY_PLAN_HEADER = `Here's your meal plan for the week 🍽️\n`;
export const DAY_PLAN_HEADER = (dayName: string) => `Tomorrow's meals (${dayName}) 🌅\n`;
export const NO_PLAN_PROMPT = `You don't have a meal plan yet! Let's generate one first 📋`;

// --- Grocery ---
export const WEEKLY_GROCERY_HEADER = `Here's your grocery list for the week 🛒\n`;
export const TOMORROW_GROCERY_HEADER = `Here's what you need for tomorrow 🛒\n`;

// --- Cook ---
export const COOK_NUMBER_PROMPT = `Please enter your cook's WhatsApp number with country code (e.g., +91XXXXXXXXXX) 📱`;
export const COOK_NUMBER_SAVED = `Cook's number saved successfully ✅`;
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
export const EXPIRED_PLAN_PROMPT = `Your meal plan has expired. Let's generate a fresh one! 📋`;

// --- Errors ---
export const INVALID_INPUT = `Please select one of the options below 👇`;
export const GENERIC_ERROR = `Something went wrong, please try again 🙏`;
export const INVALID_PHONE = `Please enter a valid WhatsApp number with country code (e.g., +91XXXXXXXXXX) 📱`;

// --- Cook Number Onboarding ---
export const COOK_NUMBER_ONBOARDING_PROMPT = `Would you like to add your cook's WhatsApp number? 👨‍🍳\nThis lets you send meal plans directly to your cook.\n\nEnter the number with country code (e.g., +91XXXXXXXXXX) or tap Skip to continue.`;
export const COOK_NUMBER_SKIP_BUTTON = `Skip`;

// --- Dish Preview ---

const CATEGORY_HEADINGS: Record<string, string> = {
  base: '*🍚 Base*',
  gravy: '*🍛 Gravy*',
  dry_veggie: '*🥗 Dry Veggie*',
  side: '*🥣 Side*',
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

export const DISH_REMOVED_CONFIRMATION = (removedDishName: string, replacementDishName: string) =>
  `Removed *${removedDishName}* 🔄 Replaced with *${replacementDishName}*`;

export const COMPONENT_REMOVED_CONFIRMATION = (name: string, category: string) =>
  `Removed *${name}* from ${category} 🔄`;


export const DISH_PREVIEW_EMPTY_ERROR = `You need at least one dish per meal slot to generate a plan 🍽️\nPlease keep at least one breakfast, one lunch, and one dinner.`;

// --- More Options Menu ---
export const MORE_OPTIONS_MENU_HEADER = `Here are more options for you 📋`;

// --- Grocery Hint ---
export const WEEKLY_PLAN_GROCERY_HINT = `💡 Tap 'More Options' to view the weekly grocery list`;


// --- Twilio WhatsApp Content Template SID Mapping ---

// --- Twilio WhatsApp Content Template SID Mapping ---
// Only out-of-session messages (reminders) need pre-approved templates.
// In-session messages use on-the-fly quick-reply templates via the Content API.

export type TemplatePurpose =
  | 'daily_reminder'
  | 'weekly_reminder'
  | 'expired_plan';

const DEFAULT_TEMPLATE_SIDS: Record<TemplatePurpose, string> = {
  daily_reminder: 'HX708fce9ebb60de686f73731e071aa8cb',
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
