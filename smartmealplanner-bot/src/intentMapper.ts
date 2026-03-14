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

  // --- Free text handling ---

  // In awaiting_cook_number state, free text is the cook's phone number
  if (conversationState === 'awaiting_cook_number') {
    return { intent: Intent.PROVIDE_COOK_NUMBER, payload: body };
  }

  // Free text in any other state is unrecognized
  return { intent: Intent.UNKNOWN };
}
