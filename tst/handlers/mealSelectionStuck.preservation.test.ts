import { describe, it, expect } from 'vitest';
import { mapWhatsAppToIntent } from '../../src/intentMapper';
import { resolveNumberedInput } from '../../src/handlers/webhookHandler';
import { Intent, ConversationState, UserIntent } from '../../src/core/types';

// ============================================================
// Preservation Test 4.1
// **Validates: Requirements 3.5**
//
// PRESERVATION TEST: Expected to PASS on fixed code.
// Verifies that mapWhatsAppToIntent returns the same results for
// all non-dish-preview conversation states after the fix.
//
// The fix added free-text handling for navigation words ("next",
// "continue", "skip", "next category", "forward") ONLY in the
// `dish_preview` state. For all other states, these words should
// still return Intent.UNKNOWN (or their existing mapped intent).
// ============================================================

const NON_DISH_PREVIEW_STATES: ConversationState[] = [
  'awaiting_cuisine',
  'awaiting_diet',
  'awaiting_meal_style',
  'awaiting_cook_number_onboarding',
  'main_menu',
  'awaiting_cook_number',
  'awaiting_preference_cuisine',
  'awaiting_preference_diet',
];

const NAV_WORDS = ['next', 'continue', 'skip', 'next category', 'forward'];

describe('Preservation 4.1: mapWhatsAppToIntent returns same results for non-dish-preview states', () => {
  describe('navigation words return Intent.UNKNOWN in non-dish-preview states (except special cases)', () => {
    for (const state of NON_DISH_PREVIEW_STATES) {
      // awaiting_cook_number and awaiting_cook_number_onboarding have special free-text handling
      if (state === 'awaiting_cook_number') {
        it(`"${state}": navigation words map to PROVIDE_COOK_NUMBER (unchanged)`, () => {
          for (const word of NAV_WORDS) {
            const result = mapWhatsAppToIntent(undefined, word, state);
            expect(result.intent).toBe(Intent.PROVIDE_COOK_NUMBER);
            expect(result.payload).toBe(word);
          }
        });
        continue;
      }

      if (state === 'awaiting_cook_number_onboarding') {
        it(`"${state}": "skip" maps to SKIP_COOK_NUMBER, others to PROVIDE_COOK_NUMBER (unchanged)`, () => {
          const skipResult = mapWhatsAppToIntent(undefined, 'skip', state);
          expect(skipResult.intent).toBe(Intent.SKIP_COOK_NUMBER);

          for (const word of NAV_WORDS.filter(w => w !== 'skip')) {
            const result = mapWhatsAppToIntent(undefined, word, state);
            expect(result.intent).toBe(Intent.PROVIDE_COOK_NUMBER);
          }
        });
        continue;
      }

      it(`"${state}": navigation words return Intent.UNKNOWN (unchanged)`, () => {
        for (const word of NAV_WORDS) {
          const result = mapWhatsAppToIntent(undefined, word, state);
          expect(result.intent).toBe(Intent.UNKNOWN);
        }
      });
    }
  });

  describe('non-navigation free text still returns Intent.UNKNOWN in non-dish-preview states', () => {
    const nonNavTexts = ['hello', 'help', 'what', 'go back', 'previous', 'menu'];

    for (const state of NON_DISH_PREVIEW_STATES) {
      if (state === 'awaiting_cook_number' || state === 'awaiting_cook_number_onboarding') {
        continue; // These states have special free-text handling
      }

      if (state === 'main_menu') {
        // In main_menu, "menu" maps to ADHOC_MENU (valid behavior from adhoc menu feature)
        it(`"${state}": non-navigation text returns Intent.UNKNOWN (except "menu" → ADHOC_MENU)`, () => {
          for (const text of nonNavTexts) {
            const result = mapWhatsAppToIntent(undefined, text, state);
            if (text === 'menu') {
              expect(result.intent).toBe(Intent.ADHOC_MENU);
            } else {
              expect(result.intent).toBe(Intent.UNKNOWN);
            }
          }
        });
        continue;
      }

      it(`"${state}": non-navigation text returns Intent.UNKNOWN (except "menu" → ADHOC_MENU)`, () => {
        for (const text of nonNavTexts) {
          const result = mapWhatsAppToIntent(undefined, text, state);
          if (text === 'menu') {
            expect(result.intent).toBe(Intent.ADHOC_MENU);
          } else {
            expect(result.intent).toBe(Intent.UNKNOWN);
          }
        }
      });
    }
  });
});

// ============================================================
// Preservation Test 4.2
// **Validates: Requirements 3.1**
//
// PRESERVATION TEST: Expected to PASS on fixed code.
// Verifies that mapWhatsAppToIntent returns the same results for
// `dish_preview` state with real button payloads (next_category,
// confirm_dishes, remove_dish_*).
//
// The fix only affects free-text handling (buttonPayload undefined).
// Real button taps should be completely unchanged.
// ============================================================

describe('Preservation 4.2: mapWhatsAppToIntent returns same results for dish_preview with real button payloads', () => {
  const state: ConversationState = 'dish_preview';

  it('next_category button payload returns Intent.NEXT_CATEGORY', () => {
    const result = mapWhatsAppToIntent('next_category', '', state);
    expect(result).toEqual<UserIntent>({ intent: Intent.NEXT_CATEGORY });
  });

  it('confirm_dishes button payload returns Intent.CONFIRM_DISHES', () => {
    const result = mapWhatsAppToIntent('confirm_dishes', '', state);
    expect(result).toEqual<UserIntent>({ intent: Intent.CONFIRM_DISHES });
  });

  it('remove_dish_* button payload returns Intent.REMOVE_DISH with correct id', () => {
    const dishIds = ['gravy_001', 'base_002', 'dry_veggie_003', 'side_004', 'breakfast_005'];
    for (const id of dishIds) {
      const result = mapWhatsAppToIntent(`remove_dish_${id}`, '', state);
      expect(result).toEqual<UserIntent>({ intent: Intent.REMOVE_DISH, payload: id });
    }
  });

  it('multi-select remove_dish button payload returns Intent.REMOVE_DISHES', () => {
    const result = mapWhatsAppToIntent('remove_dish_a,remove_dish_b', '', state);
    expect(result).toEqual<UserIntent>({ intent: Intent.REMOVE_DISHES, payload: 'a,b' });
  });

  it('single remove_dish in comma format returns Intent.REMOVE_DISH', () => {
    const result = mapWhatsAppToIntent('remove_dish_only_one', '', state);
    expect(result).toEqual<UserIntent>({ intent: Intent.REMOVE_DISH, payload: 'only_one' });
  });

  it('real button payloads ignore body text entirely', () => {
    // Even if body contains navigation words, button payload takes precedence
    const result = mapWhatsAppToIntent('next_category', 'next', state);
    expect(result).toEqual<UserIntent>({ intent: Intent.NEXT_CATEGORY });

    const result2 = mapWhatsAppToIntent('confirm_dishes', 'skip', state);
    expect(result2).toEqual<UserIntent>({ intent: Intent.CONFIRM_DISHES });
  });
});


// ============================================================
// Preservation Test 4.3
// **Validates: Requirements 3.2**
//
// PRESERVATION TEST: Expected to PASS on fixed code.
// Verifies that resolveNumberedInput correctly resolves dish
// removal numbers that don't collide with button indices.
//
// resolveNumberedInput was NOT changed by the fix — it always
// uses 1-based indexing into lastButtonIds. Dish removal numbers
// (1-6 for 6 list items) should still resolve to the correct
// remove_dish_* IDs. Numbers beyond the array length should
// return undefined.
// ============================================================

describe('Preservation 4.3: resolveNumberedInput correctly resolves dish removal numbers', () => {
  // Simulate a dish preview step with 6 list items + 2 buttons
  const lastButtonIds = [
    'remove_dish_gravy_001',
    'remove_dish_gravy_002',
    'remove_dish_gravy_003',
    'remove_dish_gravy_004',
    'remove_dish_gravy_005',
    'remove_dish_gravy_006',
    'next_category',
    'confirm_dishes',
  ];

  it('typing "1" resolves to the first dish removal ID', () => {
    const result = resolveNumberedInput(undefined, '1', lastButtonIds);
    expect(result).toBe('remove_dish_gravy_001');
  });

  it('typing "2" through "6" resolves to the correct dish removal IDs', () => {
    for (let i = 2; i <= 6; i++) {
      const result = resolveNumberedInput(undefined, String(i), lastButtonIds);
      expect(result).toBe(`remove_dish_gravy_00${i}`);
    }
  });

  it('typing "7" resolves to next_category (button after list items)', () => {
    const result = resolveNumberedInput(undefined, '7', lastButtonIds);
    expect(result).toBe('next_category');
  });

  it('typing "8" resolves to confirm_dishes (second button)', () => {
    const result = resolveNumberedInput(undefined, '8', lastButtonIds);
    expect(result).toBe('confirm_dishes');
  });

  it('typing a number beyond the array length returns undefined', () => {
    const result = resolveNumberedInput(undefined, '9', lastButtonIds);
    expect(result).toBeUndefined();
  });

  it('typing "0" returns undefined (out of 1-based range)', () => {
    const result = resolveNumberedInput(undefined, '0', lastButtonIds);
    expect(result).toBeUndefined();
  });

  it('real button payload takes precedence over typed number', () => {
    const result = resolveNumberedInput('next_category', '1', lastButtonIds);
    expect(result).toBe('next_category');
  });

  it('returns undefined when lastButtonIds is empty', () => {
    const result = resolveNumberedInput(undefined, '1', []);
    expect(result).toBeUndefined();
  });

  it('returns undefined when lastButtonIds is undefined', () => {
    const result = resolveNumberedInput(undefined, '1', undefined);
    expect(result).toBeUndefined();
  });
});
