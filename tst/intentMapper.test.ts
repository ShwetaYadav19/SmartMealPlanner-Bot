import { describe, it, expect } from 'vitest';
import { mapWhatsAppToIntent } from '../src/intentMapper';
import { Intent } from '../src/core/types';
import type { ConversationState } from '../src/core/types';

describe('mapWhatsAppToIntent', () => {
  // --- Cuisine selection (awaiting_cuisine) ---
  describe('cuisine selection in awaiting_cuisine state', () => {
    const state: ConversationState = 'awaiting_cuisine';

    it('maps "north_indian" button to SELECT_CUISINE', () => {
      const result = mapWhatsAppToIntent('north_indian', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_CUISINE, payload: 'north_indian' });
    });

    it('maps "south_indian" button to SELECT_CUISINE', () => {
      const result = mapWhatsAppToIntent('south_indian', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_CUISINE, payload: 'south_indian' });
    });

    it('maps "both" button to SELECT_CUISINE', () => {
      const result = mapWhatsAppToIntent('both', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_CUISINE, payload: 'both' });
    });
  });

  // --- Diet selection (awaiting_diet) ---
  describe('diet selection in awaiting_diet state', () => {
    const state: ConversationState = 'awaiting_diet';

    it('maps "veg" button to SELECT_DIET', () => {
      const result = mapWhatsAppToIntent('veg', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_DIET, payload: 'veg' });
    });

    it('maps "non_veg" button to SELECT_DIET', () => {
      const result = mapWhatsAppToIntent('non_veg', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_DIET, payload: 'non_veg' });
    });

    it('maps "both" button to SELECT_DIET', () => {
      const result = mapWhatsAppToIntent('both', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_DIET, payload: 'both' });
    });
  });

  // --- Meal style selection (awaiting_meal_style) ---
  describe('meal style selection in awaiting_meal_style state', () => {
    const state: ConversationState = 'awaiting_meal_style';

    it('maps "health" button to SELECT_MEAL_STYLE', () => {
      const result = mapWhatsAppToIntent('health', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_MEAL_STYLE, payload: 'health' });
    });

    it('maps "regular" button to SELECT_MEAL_STYLE', () => {
      const result = mapWhatsAppToIntent('regular', '', state);
      expect(result).toEqual({ intent: Intent.SELECT_MEAL_STYLE, payload: 'regular' });
    });
  });

  // --- Main menu button payloads (state-independent) ---
  describe('main menu button payloads', () => {
    const state: ConversationState = 'main_menu';

    it('maps "weekly_plan" to GENERATE_PLAN', () => {
      expect(mapWhatsAppToIntent('weekly_plan', '', state)).toEqual({ intent: Intent.GENERATE_PLAN });
    });

    it('maps "weekly_grocery" to VIEW_WEEKLY_GROCERY', () => {
      expect(mapWhatsAppToIntent('weekly_grocery', '', state)).toEqual({ intent: Intent.VIEW_WEEKLY_GROCERY });
    });

    it('maps "tomorrow_plan" to VIEW_TOMORROW_PLAN', () => {
      expect(mapWhatsAppToIntent('tomorrow_plan', '', state)).toEqual({ intent: Intent.VIEW_TOMORROW_PLAN });
    });

    it('maps "tomorrow_grocery" to VIEW_TOMORROW_GROCERY', () => {
      expect(mapWhatsAppToIntent('tomorrow_grocery', '', state)).toEqual({ intent: Intent.VIEW_TOMORROW_GROCERY });
    });

    it('maps "send_to_cook" to SEND_MENU_TO_COOK', () => {
      expect(mapWhatsAppToIntent('send_to_cook', '', state)).toEqual({ intent: Intent.SEND_MENU_TO_COOK });
    });

    it('maps "swap_lunch" to SWAP_LUNCH', () => {
      expect(mapWhatsAppToIntent('swap_lunch', '', state)).toEqual({ intent: Intent.SWAP_LUNCH });
    });

    it('maps "save_cook" to SAVE_COOK_NUMBER', () => {
      expect(mapWhatsAppToIntent('save_cook', '', state)).toEqual({ intent: Intent.SAVE_COOK_NUMBER });
    });
  });

  // --- Free text in awaiting_cook_number ---
  describe('free text in awaiting_cook_number state', () => {
    const state: ConversationState = 'awaiting_cook_number';

    it('maps free text to PROVIDE_COOK_NUMBER with body as payload', () => {
      const result = mapWhatsAppToIntent(undefined, '+919876543210', state);
      expect(result).toEqual({ intent: Intent.PROVIDE_COOK_NUMBER, payload: '+919876543210' });
    });

    it('maps any text body to PROVIDE_COOK_NUMBER', () => {
      const result = mapWhatsAppToIntent(undefined, 'some random text', state);
      expect(result).toEqual({ intent: Intent.PROVIDE_COOK_NUMBER, payload: 'some random text' });
    });
  });

  // --- Free text in button-expected states → UNKNOWN ---
  describe('free text in button-expected states', () => {
    it('returns UNKNOWN for free text in awaiting_cuisine', () => {
      expect(mapWhatsAppToIntent(undefined, 'hello', 'awaiting_cuisine')).toEqual({ intent: Intent.UNKNOWN });
    });

    it('returns UNKNOWN for free text in awaiting_diet', () => {
      expect(mapWhatsAppToIntent(undefined, 'veg please', 'awaiting_diet')).toEqual({ intent: Intent.UNKNOWN });
    });

    it('maps "both" text to SELECT_DIET in awaiting_diet', () => {
      expect(mapWhatsAppToIntent(undefined, 'both', 'awaiting_diet')).toEqual({ intent: Intent.SELECT_DIET, payload: 'both' });
    });

    it('maps "3" text to SELECT_DIET both in awaiting_diet', () => {
      expect(mapWhatsAppToIntent(undefined, '3', 'awaiting_diet')).toEqual({ intent: Intent.SELECT_DIET, payload: 'both' });
    });

    it('returns UNKNOWN for unrecognized free text in awaiting_meal_style', () => {
      expect(mapWhatsAppToIntent(undefined, 'something random', 'awaiting_meal_style')).toEqual({ intent: Intent.UNKNOWN });
    });

    it('maps "health" text to SELECT_MEAL_STYLE in awaiting_meal_style', () => {
      expect(mapWhatsAppToIntent(undefined, 'health', 'awaiting_meal_style')).toEqual({ intent: Intent.SELECT_MEAL_STYLE, payload: 'health' });
    });

    it('returns UNKNOWN for free text in main_menu', () => {
      expect(mapWhatsAppToIntent(undefined, 'what can you do?', 'main_menu')).toEqual({ intent: Intent.UNKNOWN });
    });
  });

  // --- Unrecognized button payloads ---
  describe('unrecognized button payloads', () => {
    it('returns UNKNOWN for an unrecognized button payload', () => {
      expect(mapWhatsAppToIntent('unknown_button', '', 'main_menu')).toEqual({ intent: Intent.UNKNOWN });
    });
  });
});
