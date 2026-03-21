import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mapWhatsAppToIntent } from '../../src/intentMapper';
import { Intent, ConversationState } from '../../src/core/types';

// ============================================================
// Preservation Property Test 4.5
// **Validates: Requirements 3.5**
//
// Property 3 — Non-Bug Inputs Unchanged
//
// PRESERVATION TEST: Expected to PASS on fixed code.
// For any conversation state OTHER than `dish_preview` and any
// random free text (no button payload), mapWhatsAppToIntent
// produces the same result as the original code. The fix only
// added handling for the `dish_preview` state, so all other
// states must be completely unaffected.
//
// We verify two key invariants:
// 1. Determinism: same input always produces the same output
// 2. Navigation words in non-dish-preview states never return
//    NEXT_CATEGORY (the fix-specific intent) via free text
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

const stateArb = fc.constantFrom(...NON_DISH_PREVIEW_STATES);

// Generate random free text including navigation words that the fix handles
const freeTextArb = fc.oneof(
  fc.constantFrom('next', 'continue', 'skip', 'next category', 'forward'),
  fc.stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyz 0123456789'.split(''),
    ),
    { minLength: 1, maxLength: 30 },
  ),
);

describe('Preservation Property 4.5: Non-dish-preview intent mapping unchanged by fix', () => {
  it('for any non-dish-preview state and any free text, the result is deterministic (same input → same output)', () => {
    fc.assert(
      fc.property(stateArb, freeTextArb, (state, text) => {
        const result1 = mapWhatsAppToIntent(undefined, text, state);
        const result2 = mapWhatsAppToIntent(undefined, text, state);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 300 },
    );
  });

  it('navigation words in non-dish-preview states never return NEXT_CATEGORY via free text', () => {
    const navWordArb = fc.constantFrom('next', 'continue', 'skip', 'next category', 'forward');

    // Exclude states that have special free-text handling (cook number states)
    const nonCookStates = NON_DISH_PREVIEW_STATES.filter(
      (s) => s !== 'awaiting_cook_number' && s !== 'awaiting_cook_number_onboarding',
    );
    const nonCookStateArb = fc.constantFrom(...nonCookStates);

    fc.assert(
      fc.property(nonCookStateArb, navWordArb, (state, navWord) => {
        const result = mapWhatsAppToIntent(undefined, navWord, state);
        expect(result.intent).not.toBe(Intent.NEXT_CATEGORY);
      }),
      { numRuns: 200 },
    );
  });

  it('for awaiting_cook_number state, any free text returns PROVIDE_COOK_NUMBER (unchanged)', () => {
    fc.assert(
      fc.property(freeTextArb, (text) => {
        const result = mapWhatsAppToIntent(undefined, text, 'awaiting_cook_number');
        expect(result.intent).toBe(Intent.PROVIDE_COOK_NUMBER);
        expect(result.payload).toBe(text);
      }),
      { numRuns: 100 },
    );
  });

  it('for awaiting_cook_number_onboarding, "skip" returns SKIP_COOK_NUMBER and other text returns PROVIDE_COOK_NUMBER (unchanged)', () => {
    const nonSkipTextArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 1, maxLength: 20 },
    ).filter((t) => t.trim().toLowerCase() !== 'skip');

    fc.assert(
      fc.property(nonSkipTextArb, (text) => {
        const result = mapWhatsAppToIntent(undefined, text, 'awaiting_cook_number_onboarding');
        expect(result.intent).toBe(Intent.PROVIDE_COOK_NUMBER);
      }),
      { numRuns: 100 },
    );

    // "skip" specifically
    const skipResult = mapWhatsAppToIntent(undefined, 'skip', 'awaiting_cook_number_onboarding');
    expect(skipResult.intent).toBe(Intent.SKIP_COOK_NUMBER);
  });
});


// ============================================================
// Preservation Property Test 4.6
// **Validates: Requirements 3.1, 3.2, 3.5**
//
// Property 3 — Non-Bug Inputs Unchanged
//
// PRESERVATION TEST: Expected to PASS on fixed code.
// For `dish_preview` state with real button payloads
// (next_category, confirm_dishes, remove_dish_xxx), the intent
// mapping is unchanged. The fix only affects free-text handling
// (when buttonPayload is undefined), so real button payloads
// must continue to produce the same intents as before.
// ============================================================

describe('Preservation Property 4.6: dish_preview with real button payloads unchanged by fix', () => {
  it('"next_category" button payload always returns NEXT_CATEGORY in dish_preview', () => {
    const anyTextArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz 0123456789'.split('')),
      { minLength: 0, maxLength: 30 },
    );

    fc.assert(
      fc.property(anyTextArb, (text) => {
        const result = mapWhatsAppToIntent('next_category', text, 'dish_preview');
        expect(result.intent).toBe(Intent.NEXT_CATEGORY);
        expect(result.payload).toBeUndefined();
      }),
      { numRuns: 200 },
    );
  });

  it('"confirm_dishes" button payload always returns CONFIRM_DISHES in dish_preview', () => {
    const anyTextArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz 0123456789'.split('')),
      { minLength: 0, maxLength: 30 },
    );

    fc.assert(
      fc.property(anyTextArb, (text) => {
        const result = mapWhatsAppToIntent('confirm_dishes', text, 'dish_preview');
        expect(result.intent).toBe(Intent.CONFIRM_DISHES);
        expect(result.payload).toBeUndefined();
      }),
      { numRuns: 200 },
    );
  });

  it('"remove_dish_" + random suffix always returns REMOVE_DISH with correct payload in dish_preview', () => {
    const suffixArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 1, maxLength: 30 },
    );
    const anyTextArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz 0123456789'.split('')),
      { minLength: 0, maxLength: 30 },
    );

    fc.assert(
      fc.property(suffixArb, anyTextArb, (suffix, text) => {
        const payload = `remove_dish_${suffix}`;
        const result = mapWhatsAppToIntent(payload, text, 'dish_preview');
        expect(result.intent).toBe(Intent.REMOVE_DISH);
        expect(result.payload).toBe(suffix);
      }),
      { numRuns: 300 },
    );
  });
});
