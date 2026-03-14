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

// --- Twilio WhatsApp Content Template SID Mapping ---

export type TemplatePurpose =
  | 'main_menu'
  | 'main_menu_button'
  | 'menu_more'
  | 'daily_reminder'
  | 'cook_options'
  | 'diet_selection'
  | 'cuisine_selection'
  | 'meal_style';

const DEFAULT_TEMPLATE_SIDS: Record<TemplatePurpose, string> = {
  main_menu: 'HXe992435f98fde5249c641a135bb5dbd5',
  main_menu_button: 'HX050102bc4bf8f0f9a48473db7ea7152e',
  menu_more: 'HX7957efc7a19b2b9c8d2910ba15e6a2c5',
  daily_reminder: 'HX708fce9ebb60de686f73731e071aa8cb',
  cook_options: 'HX6eddbb2f0eb2678e3f505e3786dec4e8',
  diet_selection: 'HX5ad138d83501b0b1111e0a19a524dfd5',
  cuisine_selection: 'HX62d7649f7e38d88bec1b7d85b25ea83e',
  meal_style: 'HX26deeadd8ad7de0baf4568365e3da981',
};

const ENV_VAR_MAP: Record<TemplatePurpose, string> = {
  main_menu: 'TWILIO_TEMPLATE_SID_MAIN_MENU',
  main_menu_button: 'TWILIO_TEMPLATE_SID_MAIN_MENU_BUTTON',
  menu_more: 'TWILIO_TEMPLATE_SID_MENU_MORE',
  daily_reminder: 'TWILIO_TEMPLATE_SID_DAILY_REMINDER',
  cook_options: 'TWILIO_TEMPLATE_SID_COOK_OPTIONS',
  diet_selection: 'TWILIO_TEMPLATE_SID_DIET_SELECTION',
  cuisine_selection: 'TWILIO_TEMPLATE_SID_CUISINE_SELECTION',
  meal_style: 'TWILIO_TEMPLATE_SID_MEAL_STYLE',
};

export function getTemplateSid(purpose: TemplatePurpose): string {
  const envVar = ENV_VAR_MAP[purpose];
  return process.env[envVar] || DEFAULT_TEMPLATE_SIDS[purpose];
}
