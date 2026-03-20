import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock twilio — same pattern as other mealSelectionStuck tests
const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' });
const mockContentCreate = vi.fn().mockResolvedValue({ sid: 'HX_DYNAMIC_123' });

vi.mock('twilio', () => ({
  default: () => ({
    messages: { create: mockCreate },
    content: { v1: { contents: { create: mockContentCreate } } },
  }),
}));

import { TwilioMessagingProvider } from '../../src/adapters/twilioMessagingProvider';

// ============================================================
// Fix-Check Property Test 3.4
// **Validates: Requirements 2.1, 2.2, 2.3**
//
// Property 1 — Fallback Button Numbering Continues From List Count
//
// FIX-CHECK TEST: Expected to PASS on fixed code.
// For any listItemCount N (0–20) and any button array (1–3 buttons
// with random titles), when the quick-reply template fails and
// sendButtonMessage falls back to numbered text, the buttons are
// numbered starting at N+1.
// ============================================================

describe('Fix-Check Property 3.4: Fallback button numbering continues from list count', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockContentCreate.mockClear();
  });

  it('for any listItemCount N and button array, fallback text numbers buttons starting at N+1', async () => {
    const buttonArb = fc.record({
      id: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')), { minLength: 3, maxLength: 20 }),
      title: fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz 🍛➡️✅'.split('')), { minLength: 1, maxLength: 20 }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        fc.array(buttonArb, { minLength: 1, maxLength: 3 }),
        async (listItemCount, buttons) => {
          // Reset mocks for each property run
          mockCreate.mockClear();
          mockContentCreate.mockClear();

          // Force the quick-reply template to fail so we hit the fallback path
          mockContentCreate.mockRejectedValueOnce(new Error('Content API error'));
          mockCreate.mockResolvedValue({ sid: 'SM123' });

          const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

          const body = 'Test message body';

          await provider.sendButtonMessage('+919876543210', body, buttons, undefined, listItemCount);

          // The fallback path should have been triggered
          const fallbackCall = mockCreate.mock.calls[0]?.[0];
          expect(fallbackCall).toBeDefined();

          const sentBody: string = fallbackCall.body;

          // Verify each button is numbered starting at listItemCount + 1
          for (let i = 0; i < buttons.length; i++) {
            const expectedNumber = listItemCount + i + 1;
            const expectedPrefix = `${expectedNumber}. ${buttons[i].title}`;
            expect(sentBody).toContain(expectedPrefix);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Fix-Check Property Test 3.5
// **Validates: Requirements 2.4**
//
// Property 2 — Free Text Navigation in Dish Preview
//
// FIX-CHECK TEST: Expected to PASS on fixed code.
// For any navigation word ("next", "continue", "skip",
// "next category", "forward") with random casing and
// leading/trailing whitespace, mapWhatsAppToIntent returns
// Intent.NEXT_CATEGORY when conversationState is "dish_preview".
// ============================================================

import { mapWhatsAppToIntent } from '../../src/intentMapper';
import { Intent } from '../../src/core/types';

describe('Fix-Check Property 3.5: Free text navigation in dish_preview returns NEXT_CATEGORY', () => {
  it('for any navigation word variation in dish_preview state, mapWhatsAppToIntent returns NEXT_CATEGORY', () => {
    const navWords = ['next', 'continue', 'skip', 'next category', 'forward'];

    // Arbitrary that picks a navigation word and applies random casing + whitespace
    const navWordVariationArb = fc
      .record({
        word: fc.constantFrom(...navWords),
        casing: fc.constantFrom('lower', 'upper', 'mixed') as fc.Arbitrary<'lower' | 'upper' | 'mixed'>,
        leadingSpaces: fc.integer({ min: 0, max: 5 }),
        trailingSpaces: fc.integer({ min: 0, max: 5 }),
      })
      .map(({ word, casing, leadingSpaces, trailingSpaces }) => {
        let transformed: string;
        switch (casing) {
          case 'upper':
            transformed = word.toUpperCase();
            break;
          case 'mixed':
            transformed = word
              .split('')
              .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
              .join('');
            break;
          default:
            transformed = word;
        }
        return ' '.repeat(leadingSpaces) + transformed + ' '.repeat(trailingSpaces);
      });

    fc.assert(
      fc.property(navWordVariationArb, (variation) => {
        const result = mapWhatsAppToIntent(undefined, variation, 'dish_preview');
        expect(result.intent).toBe(Intent.NEXT_CATEGORY);
      }),
      { numRuns: 200 },
    );
  });
});
