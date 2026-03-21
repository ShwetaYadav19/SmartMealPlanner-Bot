import { Intent, ConversationState, UserIntent } from './core/types';

/**
 * WhatsApp-specific intent mapper.
 * Converts Twilio webhook payloads (button callbacks + free text)
 * into channel-agnostic UserIntent objects for the core BotEngine.
 *
 * A future mobile app would have its own intent mapper that converts
 * REST API request bodies to the same UserIntent objects.
 */
export function mapWhatsAppToIntent(
  buttonPayload: string | undefined,
  body: string,
  conversationState: ConversationState,
): UserIntent {
  const text = body.trim().toLowerCase();

  // --- Button payload mappings (state-dependent onboarding) ---
  if (buttonPayload) {
    // Cuisine selection during onboarding or preference change
    if (
      (conversationState === 'awaiting_cuisine' || conversationState === 'awaiting_preference_cuisine') &&
      (buttonPayload === 'north_indian' || buttonPayload === 'south_indian' || buttonPayload === 'both')
    ) {
      return { intent: Intent.SELECT_CUISINE, payload: buttonPayload };
    }

    // Diet selection during onboarding or preference change
    if (
      (conversationState === 'awaiting_diet' || conversationState === 'awaiting_preference_diet') &&
      (buttonPayload === 'veg' || buttonPayload === 'non_veg' || buttonPayload === 'both')
    ) {
      return { intent: Intent.SELECT_DIET, payload: buttonPayload };
    }

    // Meal style selection during onboarding or preference change
    if (
      (conversationState === 'awaiting_meal_style' || conversationState === 'awaiting_preference_style') &&
      (buttonPayload === 'health' || buttonPayload === 'regular')
    ) {
      return { intent: Intent.SELECT_MEAL_STYLE, payload: buttonPayload };
    }

    // Skip cook number during onboarding
    if (conversationState === 'awaiting_cook_number_onboarding' && buttonPayload === 'skip_cook') {
      return { intent: Intent.SKIP_COOK_NUMBER };
    }

    // Dish preview actions
    if (conversationState === 'dish_preview') {
      // Multi-select: comma-separated remove_dish_ payloads (e.g. "remove_dish_a,remove_dish_b")
      if (buttonPayload.includes(',') && buttonPayload.startsWith('remove_dish_')) {
        const ids = buttonPayload.split(',')
          .filter(p => p.startsWith('remove_dish_'))
          .map(p => p.slice('remove_dish_'.length));
        if (ids.length > 1) {
          return { intent: Intent.REMOVE_DISHES, payload: ids.join(',') };
        }
        if (ids.length === 1) {
          return { intent: Intent.REMOVE_DISH, payload: ids[0] };
        }
      }
      if (buttonPayload.startsWith('remove_dish_')) {
        const dishId = buttonPayload.slice('remove_dish_'.length);
        return { intent: Intent.REMOVE_DISH, payload: dishId };
      }
      if (buttonPayload === 'confirm_dishes') {
        return { intent: Intent.CONFIRM_DISHES };
      }
      if (buttonPayload === 'next_category') {
        return { intent: Intent.NEXT_CATEGORY };
      }
    }

    // --- Change Plan flow button payloads ---
    switch (buttonPayload) {
      case 'change_plan':
        return { intent: Intent.CHANGE_PLAN };
      case 'tomorrow_meals':
        return { intent: Intent.CHANGE_TOMORROW_MEALS };
      case 'few_meals':
        return { intent: Intent.CHANGE_FEW_MEALS };
      case 'entire_plan':
        return { intent: Intent.CHANGE_ENTIRE_PLAN };
      case 'accept_plan':
        return { intent: Intent.ACCEPT_PLAN };
      case 'retry_plan':
        return { intent: Intent.RETRY_PLAN };
      case 'change_more':
        return { intent: Intent.CHANGE_MORE_MEALS };
      case 'done_changing':
        return { intent: Intent.DONE_CHANGING };
      case 'change_preference':
        return { intent: Intent.CHANGE_PREFERENCE };
      case 'change_cook_number':
        return { intent: Intent.CHANGE_COOK_NUMBER };
    }

    // --- Day selection payloads (day_0 through day_6) ---
    const dayMatch = buttonPayload.match(/^day_([0-6])$/);
    if (dayMatch) {
      return { intent: Intent.SELECT_DAY, payload: dayMatch[1] };
    }

    // --- Slot selection payloads ---
    switch (buttonPayload) {
      case 'slot_breakfast':
        return { intent: Intent.SELECT_MEAL_SLOT, payload: 'breakfast' };
      case 'slot_lunch':
        return { intent: Intent.SELECT_MEAL_SLOT, payload: 'lunch' };
      case 'slot_dinner':
        return { intent: Intent.SELECT_MEAL_SLOT, payload: 'dinner' };
    }

    // --- Alternative selection payloads (alt_0, alt_1, alt_2) ---
    const altMatch = buttonPayload.match(/^alt_([0-2])$/);
    if (altMatch) {
      return { intent: Intent.SELECT_ALTERNATIVE, payload: altMatch[1] };
    }

    // --- State-independent button payloads (main menu actions) ---
    switch (buttonPayload) {
      case 'happy_with_menu':
        return { intent: Intent.HAPPY_WITH_MENU };
      case 'weekly_plan':
        return { intent: Intent.GENERATE_PLAN };
      case 'weekly_grocery':
        return { intent: Intent.VIEW_WEEKLY_GROCERY };
      case 'tomorrow_plan':
        return { intent: Intent.VIEW_TOMORROW_PLAN };
      case 'tomorrow_grocery':
        return { intent: Intent.VIEW_TOMORROW_GROCERY };
      case 'send_to_cook':
        return { intent: Intent.SEND_MENU_TO_COOK };
      case 'swap_lunch':
        return { intent: Intent.SWAP_LUNCH };
      case 'save_cook':
        return { intent: Intent.SAVE_COOK_NUMBER };
    }
  }

  // --- Free text / number input handling (sandbox mode support) ---

  // Cuisine selection via text
  if (conversationState === 'awaiting_cuisine' || conversationState === 'awaiting_preference_cuisine') {
    if (text === '1' || text === 'north indian') return { intent: Intent.SELECT_CUISINE, payload: 'north_indian' };
    if (text === '2' || text === 'south indian') return { intent: Intent.SELECT_CUISINE, payload: 'south_indian' };
    if (text === '3' || text === 'both') return { intent: Intent.SELECT_CUISINE, payload: 'both' };
  }

  // Diet selection via text
  if (conversationState === 'awaiting_diet' || conversationState === 'awaiting_preference_diet') {
    if (text === '1' || text === 'veg') return { intent: Intent.SELECT_DIET, payload: 'veg' };
    if (text === '2' || text === 'non-veg' || text === 'non veg' || text === 'nonveg') return { intent: Intent.SELECT_DIET, payload: 'non_veg' };
    if (text === '3' || text === 'both') return { intent: Intent.SELECT_DIET, payload: 'both' };
  }

  // Meal style selection via text
  if (conversationState === 'awaiting_meal_style' || conversationState === 'awaiting_preference_style') {
    if (text === '1' || text === 'health') return { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' };
    if (text === '2' || text === 'regular' || text === 'regular home meals') return { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' };
  }

  // Main menu actions via text
  if (conversationState === 'main_menu') {
    // Adhoc menu trigger for onboarded users
    if (text === 'hi' || text === 'menu') return { intent: Intent.ADHOC_MENU };
    if (text === '1' || text === 'weekly meal plan' || text === 'weekly plan') return { intent: Intent.GENERATE_PLAN };
    if (text === '2' || text === 'weekly grocery list' || text === 'weekly grocery') return { intent: Intent.VIEW_WEEKLY_GROCERY };
    if (text === '3' || text === "tomorrow's plan" || text === 'tomorrow plan') return { intent: Intent.VIEW_TOMORROW_PLAN };
    if (text === '4' || text === "tomorrow's grocery" || text === 'tomorrow grocery') return { intent: Intent.VIEW_TOMORROW_GROCERY };
    if (text === '5' || text === 'send menu to cook' || text === 'send to cook') return { intent: Intent.SEND_MENU_TO_COOK };
    if (text === '6' || text === 'swap lunch') return { intent: Intent.SWAP_LUNCH };
    if (text === '7' || text === 'save cook' || text === "save cook's number") return { intent: Intent.SAVE_COOK_NUMBER };
    if (text === 'change cook' || text === 'change cook number' || text === "change cook's number") return { intent: Intent.CHANGE_COOK_NUMBER };
  }

  // In awaiting_cook_number_onboarding, allow "skip" as free text (sandbox mode support)
  if (conversationState === 'awaiting_cook_number_onboarding') {
    if (text === 'skip') return { intent: Intent.SKIP_COOK_NUMBER };
    return { intent: Intent.PROVIDE_COOK_NUMBER, payload: body };
  }

  // In awaiting_cook_number state, free text is the cook's phone number
  if (conversationState === 'awaiting_cook_number') {
    return { intent: Intent.PROVIDE_COOK_NUMBER, payload: body };
  }

  // Free-text navigation in dish_preview state (fallback when quick-reply buttons fail)
  if (conversationState === 'dish_preview') {
    const navWords = ['next', 'continue', 'skip', 'next category', 'forward'];
    // Strip emojis and extra whitespace for matching (e.g. "Next ➡️" → "next")
    const stripped = text.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    if (navWords.includes(text) || navWords.includes(stripped)) {
      return { intent: Intent.NEXT_CATEGORY };
    }
  }

  // Global adhoc menu trigger — "hi" or "menu" from any state (for onboarded users)
  if (text === 'hi' || text === 'menu') {
    return { intent: Intent.ADHOC_MENU };
  }

  // Free text in any other state is unrecognized
  return { intent: Intent.UNKNOWN };
}
