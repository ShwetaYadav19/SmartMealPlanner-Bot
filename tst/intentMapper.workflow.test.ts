import { describe, it, expect } from 'vitest';
import { mapWhatsAppToIntent } from '../src/intentMapper';
import { Intent } from '../src/core/types';
import type { ConversationState } from '../src/core/types';

describe('intentMapper – workflow mappings', () => {
  // --- Task 4.1: Button payload mappings for Change Plan flow ---
  describe('change plan button payloads', () => {
    it.each([
      ['change_plan', Intent.CHANGE_PLAN],
      ['few_meals', Intent.CHANGE_FEW_MEALS],
      ['entire_plan', Intent.CHANGE_ENTIRE_PLAN],
      ['accept_plan', Intent.ACCEPT_PLAN],
      ['retry_plan', Intent.RETRY_PLAN],
      ['change_more', Intent.CHANGE_MORE_MEALS],
      ['done_changing', Intent.DONE_CHANGING],
    ] as const)('maps "%s" button to %s', (payload, expectedIntent) => {
      // These are state-independent button payloads
      const result = mapWhatsAppToIntent(payload, '', 'main_menu');
      expect(result).toEqual({ intent: expectedIntent });
    });

    it('maps change_plan from change_plan_menu state', () => {
      const result = mapWhatsAppToIntent('few_meals', '', 'change_plan_menu');
      expect(result).toEqual({ intent: Intent.CHANGE_FEW_MEALS });
    });

    it('maps accept_plan from entire_plan_confirm state', () => {
      const result = mapWhatsAppToIntent('accept_plan', '', 'entire_plan_confirm');
      expect(result).toEqual({ intent: Intent.ACCEPT_PLAN });
    });

    it('maps retry_plan from entire_plan_confirm state', () => {
      const result = mapWhatsAppToIntent('retry_plan', '', 'entire_plan_confirm');
      expect(result).toEqual({ intent: Intent.RETRY_PLAN });
    });

    it('maps change_more from few_meals_alternatives state', () => {
      const result = mapWhatsAppToIntent('change_more', '', 'few_meals_alternatives');
      expect(result).toEqual({ intent: Intent.CHANGE_MORE_MEALS });
    });

    it('maps done_changing from few_meals_alternatives state', () => {
      const result = mapWhatsAppToIntent('done_changing', '', 'few_meals_alternatives');
      expect(result).toEqual({ intent: Intent.DONE_CHANGING });
    });
  });

  // --- Task 4.2: Day selection mappings ---
  describe('day selection mappings (day_0 through day_6)', () => {
    it.each([0, 1, 2, 3, 4, 5, 6])('maps "day_%i" to SELECT_DAY with payload "%i"', (dayIndex) => {
      const result = mapWhatsAppToIntent(`day_${dayIndex}`, '', 'few_meals_day_select');
      expect(result).toEqual({ intent: Intent.SELECT_DAY, payload: String(dayIndex) });
    });

    it('maps day_0 from main_menu state (state-independent)', () => {
      const result = mapWhatsAppToIntent('day_3', '', 'main_menu');
      expect(result).toEqual({ intent: Intent.SELECT_DAY, payload: '3' });
    });

    it('does not match day_7 (out of range)', () => {
      const result = mapWhatsAppToIntent('day_7', '', 'few_meals_day_select');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });

    it('does not match day_ without a number', () => {
      const result = mapWhatsAppToIntent('day_', '', 'few_meals_day_select');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });
  });

  // --- Task 4.3: Slot selection mappings ---
  describe('slot selection mappings', () => {
    it('maps "slot_breakfast" to SELECT_MEAL_SLOT with payload "breakfast"', () => {
      const result = mapWhatsAppToIntent('slot_breakfast', '', 'few_meals_slot_select');
      expect(result).toEqual({ intent: Intent.SELECT_MEAL_SLOT, payload: 'breakfast' });
    });

    it('maps "slot_lunch" to SELECT_MEAL_SLOT with payload "lunch"', () => {
      const result = mapWhatsAppToIntent('slot_lunch', '', 'few_meals_slot_select');
      expect(result).toEqual({ intent: Intent.SELECT_MEAL_SLOT, payload: 'lunch' });
    });

    it('maps "slot_dinner" to SELECT_MEAL_SLOT with payload "dinner"', () => {
      const result = mapWhatsAppToIntent('slot_dinner', '', 'few_meals_slot_select');
      expect(result).toEqual({ intent: Intent.SELECT_MEAL_SLOT, payload: 'dinner' });
    });

    it('slot payloads work from any state', () => {
      const result = mapWhatsAppToIntent('slot_lunch', '', 'main_menu');
      expect(result).toEqual({ intent: Intent.SELECT_MEAL_SLOT, payload: 'lunch' });
    });
  });

  // --- Task 4.4: Alternative selection mappings ---
  describe('alternative selection mappings', () => {
    it.each([0, 1, 2])('maps "alt_%i" to SELECT_ALTERNATIVE with payload "%i"', (altIndex) => {
      const result = mapWhatsAppToIntent(`alt_${altIndex}`, '', 'few_meals_alternatives');
      expect(result).toEqual({ intent: Intent.SELECT_ALTERNATIVE, payload: String(altIndex) });
    });

    it('does not match alt_3 (out of range)', () => {
      const result = mapWhatsAppToIntent('alt_3', '', 'few_meals_alternatives');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });

    it('does not match alt_ without a number', () => {
      const result = mapWhatsAppToIntent('alt_', '', 'few_meals_alternatives');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });

    it('alt payloads work from any state', () => {
      const result = mapWhatsAppToIntent('alt_1', '', 'main_menu');
      expect(result).toEqual({ intent: Intent.SELECT_ALTERNATIVE, payload: '1' });
    });
  });

  // --- Task 4.5: Free-text "hi" and "menu" → ADHOC_MENU ---
  describe('adhoc menu free-text mapping', () => {
    it('maps "hi" to ADHOC_MENU in main_menu state', () => {
      const result = mapWhatsAppToIntent(undefined, 'hi', 'main_menu');
      expect(result).toEqual({ intent: Intent.ADHOC_MENU });
    });

    it('maps "menu" to ADHOC_MENU in main_menu state', () => {
      const result = mapWhatsAppToIntent(undefined, 'menu', 'main_menu');
      expect(result).toEqual({ intent: Intent.ADHOC_MENU });
    });

    it('maps "Hi" (case-insensitive) to ADHOC_MENU in main_menu state', () => {
      const result = mapWhatsAppToIntent(undefined, 'Hi', 'main_menu');
      expect(result).toEqual({ intent: Intent.ADHOC_MENU });
    });

    it('maps "MENU" (case-insensitive) to ADHOC_MENU in main_menu state', () => {
      const result = mapWhatsAppToIntent(undefined, 'MENU', 'main_menu');
      expect(result).toEqual({ intent: Intent.ADHOC_MENU });
    });

    it('maps "hi" to ADHOC_MENU in awaiting_cuisine state (botEngine decides behavior)', () => {
      const result = mapWhatsAppToIntent(undefined, 'hi', 'awaiting_cuisine');
      expect(result).toEqual({ intent: Intent.ADHOC_MENU });
    });

    it('maps "hi" to ADHOC_MENU in few_meals_day_select state (botEngine decides behavior)', () => {
      const result = mapWhatsAppToIntent(undefined, 'hi', 'few_meals_day_select');
      expect(result).toEqual({ intent: Intent.ADHOC_MENU });
    });

    it('does NOT map "hello" to ADHOC_MENU (only "hi" and "menu")', () => {
      const result = mapWhatsAppToIntent(undefined, 'hello', 'main_menu');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });
  });

  // --- Cross-cutting: existing mappings still work ---
  describe('existing mappings are preserved', () => {
    it('weekly_plan button still maps to GENERATE_PLAN', () => {
      const result = mapWhatsAppToIntent('weekly_plan', '', 'main_menu');
      expect(result).toEqual({ intent: Intent.GENERATE_PLAN });
    });

    it('more_options button maps to UNKNOWN (removed)', () => {
      const result = mapWhatsAppToIntent('more_options', '', 'main_menu');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });

    it('free text "1" in main_menu still maps to GENERATE_PLAN', () => {
      const result = mapWhatsAppToIntent(undefined, '1', 'main_menu');
      expect(result).toEqual({ intent: Intent.GENERATE_PLAN });
    });

    it('unrecognized button payload returns UNKNOWN', () => {
      const result = mapWhatsAppToIntent('unknown_button', '', 'main_menu');
      expect(result).toEqual({ intent: Intent.UNKNOWN });
    });
  });
});
