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
    // Cuisine selection during onboarding
    if (
      conversationState === 'awaiting_cuisine' &&
      (buttonPayload === 'north_indian' || buttonPayload === 'south_indian' || buttonPayload === 'both')
    ) {
      return { intent: Intent.SELECT_CUISINE, payload: buttonPayload };
    }

    // Diet selection during onboarding
    if (
      conversationState === 'awaiting_diet' &&
      (buttonPayload === 'veg' || buttonPayload === 'non_veg')
    ) {
      return { intent: Intent.SELECT_DIET, payload: buttonPayload };
    }

    // Meal style selection during onboarding
    if (
      conversationState === 'awaiting_meal_style' &&
      (buttonPayload === 'health' || buttonPayload === 'regular')
    ) {
      return { intent: Intent.SELECT_MEAL_STYLE, payload: buttonPayload };
    }

    // --- State-independent button payloads (main menu actions) ---
    switch (buttonPayload) {
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
  if (conversationState === 'awaiting_cuisine') {
    if (text === '1' || text === 'north indian') return { intent: Intent.SELECT_CUISINE, payload: 'north_indian' };
    if (text === '2' || text === 'south indian') return { intent: Intent.SELECT_CUISINE, payload: 'south_indian' };
    if (text === '3' || text === 'both') return { intent: Intent.SELECT_CUISINE, payload: 'both' };
  }

  // Diet selection via text
  if (conversationState === 'awaiting_diet') {
    if (text === '1' || text === 'veg') return { intent: Intent.SELECT_DIET, payload: 'veg' };
    if (text === '2' || text === 'non-veg' || text === 'non veg' || text === 'nonveg') return { intent: Intent.SELECT_DIET, payload: 'non_veg' };
  }

  // Meal style selection via text
  if (conversationState === 'awaiting_meal_style') {
    if (text === '1' || text === 'health') return { intent: Intent.SELECT_MEAL_STYLE, payload: 'health' };
    if (text === '2' || text === 'regular' || text === 'regular home meals') return { intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' };
  }

  // Main menu actions via text
  if (conversationState === 'main_menu') {
    if (text === '1' || text === 'weekly meal plan' || text === 'weekly plan') return { intent: Intent.GENERATE_PLAN };
    if (text === '2' || text === 'weekly grocery list' || text === 'weekly grocery') return { intent: Intent.VIEW_WEEKLY_GROCERY };
    if (text === '3' || text === "tomorrow's plan" || text === 'tomorrow plan') return { intent: Intent.VIEW_TOMORROW_PLAN };
    if (text === '4' || text === "tomorrow's grocery" || text === 'tomorrow grocery') return { intent: Intent.VIEW_TOMORROW_GROCERY };
    if (text === '5' || text === 'send menu to cook' || text === 'send to cook') return { intent: Intent.SEND_MENU_TO_COOK };
    if (text === '6' || text === 'swap lunch') return { intent: Intent.SWAP_LUNCH };
    if (text === '7' || text === 'save cook' || text === "save cook's number") return { intent: Intent.SAVE_COOK_NUMBER };
  }

  // In awaiting_cook_number state, free text is the cook's phone number
  if (conversationState === 'awaiting_cook_number') {
    return { intent: Intent.PROVIDE_COOK_NUMBER, payload: body };
  }

  // Free text in any other state is unrecognized
  return { intent: Intent.UNKNOWN };
}
