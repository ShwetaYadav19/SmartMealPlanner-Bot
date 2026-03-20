import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock twilio — same pattern as bugCondition test
const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' });
const mockContentCreate = vi.fn().mockResolvedValue({ sid: 'HX_DYNAMIC_123' });

vi.mock('twilio', () => ({
  default: () => ({
    messages: { create: mockCreate },
    content: { v1: { contents: { create: mockContentCreate } } },
  }),
}));

import { TwilioMessagingProvider } from '../../src/adapters/twilioMessagingProvider';
import { mapWhatsAppToIntent } from '../../src/intentMapper';
import { resolveNumberedInput } from '../../src/handlers/webhookHandler';
import { Intent } from '../../src/core/types';

// ============================================================
// Fix-Check Test 3.1
// **Validates: Requirements 2.1, 2.2, 2.3**
//
// FIX-CHECK TEST: Expected to PASS on fixed code.
// Verifies that sendButtonMessage fallback renders "7. Next ➡️"
// when listItemCount is 6, so the button number continues from
// the list item count instead of restarting at 1.
// ============================================================

describe('Fix-Check 3.1: sendButtonMessage fallback renders "7. Next ➡️" when listItemCount is 6', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockContentCreate.mockClear();
  });

  it('fallback renders "7. Next ➡️" (not "1. Next ➡️") when listItemCount is 6', async () => {
    // Force the quick-reply template creation to fail so we hit the fallback path
    mockContentCreate.mockRejectedValueOnce(new Error('Content API error'));
    mockCreate.mockResolvedValue({ sid: 'SM123' });

    const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

    // Simulate a dish preview body with 6 numbered list items (like a gravy step)
    const bodyWithListItems = [
      '🍛 Step 3/5 — Gravy',
      '',
      '1. Paneer Butter Masala',
      '2. Dal Makhani',
      '3. Shahi Paneer',
      '4. Palak Paneer',
      '5. Malai Kofta',
      '6. Chana Masala',
      '',
      'Reply with a number to remove, or tap Next to continue.',
    ].join('\n');

    const buttons = [{ id: 'next_category', title: 'Next ➡️' }];

    // Pass listItemCount = 6 so fallback numbering continues from 7
    await provider.sendButtonMessage('+919876543210', bodyWithListItems, buttons, undefined, 6);

    // The fallback path should have been triggered (template creation failed)
    expect(mockContentCreate).toHaveBeenCalledOnce();

    // Capture the message body sent via the fallback
    const fallbackCall = mockCreate.mock.calls[0][0];
    const sentBody: string = fallbackCall.body;

    // FIX VERIFICATION: The fallback should render "7. Next ➡️" (not "1. Next ➡️")
    // because listItemCount is 6, so the first button starts at 6 + 0 + 1 = 7
    expect(sentBody).toContain('7. Next ➡️');
    expect(sentBody).not.toContain('\n1. Next ➡️');

    // Verify the body still has the original list items
    expect(sentBody).toContain('1. Paneer Butter Masala');
    expect(sentBody).toContain('6. Chana Masala');
  });
});


// ============================================================
// Fix-Check Test 3.2
// **Validates: Requirements 2.4**
//
// FIX-CHECK TEST: Expected to PASS on fixed code.
// Verifies that mapWhatsAppToIntent returns Intent.NEXT_CATEGORY
// for navigation words "next", "continue", "skip" when the
// conversation state is dish_preview.
// ============================================================

describe('Fix-Check 3.2: mapWhatsAppToIntent returns NEXT_CATEGORY for navigation words in dish_preview', () => {
  it.each(['next', 'continue', 'skip'])('returns Intent.NEXT_CATEGORY for "%s" in dish_preview', (word) => {
    const result = mapWhatsAppToIntent(undefined, word, 'dish_preview');
    expect(result.intent).toBe(Intent.NEXT_CATEGORY);
  });
});


// ============================================================
// Fix-Check Test 3.3
// **Validates: Requirements 2.1, 2.2**
//
// FIX-CHECK TEST: Expected to PASS on fixed code.
// Verifies that resolveNumberedInput resolves the correct offset
// number to `next_category` when list items precede buttons in
// `lastButtonIds`.
//
// After the fix, the fallback renders "7. Next ➡️" (not "1.")
// when there are 6 list items. The user types "7", and
// resolveNumberedInput maps "7" → lastButtonIds[6] which is
// `next_category`.
//
// Note: resolveNumberedInput itself was NOT changed by the fix —
// it always used 1-based indexing into lastButtonIds. The fix was
// in the fallback numbering display. This test confirms that when
// the user types the CORRECT offset number (7 instead of 1),
// resolveNumberedInput resolves it to next_category.
// ============================================================

describe('Fix-Check 3.3: resolveNumberedInput resolves correct offset number to next_category', () => {
  it('typing "7" resolves to next_category when lastButtonIds has 6 list items before the button', () => {
    // Simulate a dish preview step with 6 removable dishes + 1 "Next" button
    const lastButtonIds = [
      'remove_dish_gravy_001',
      'remove_dish_gravy_002',
      'remove_dish_gravy_003',
      'remove_dish_gravy_004',
      'remove_dish_gravy_005',
      'remove_dish_gravy_006',
      'next_category',
    ];

    // After the fix, the fallback renders "7. Next ➡️" so the user types "7"
    const result = resolveNumberedInput(undefined, '7', lastButtonIds);

    // FIX VERIFICATION: "7" resolves to lastButtonIds[6] which is next_category
    expect(result).toBe('next_category');
  });

  it('typing "1" still resolves to the first list item (dish removal is preserved)', () => {
    const lastButtonIds = [
      'remove_dish_gravy_001',
      'remove_dish_gravy_002',
      'remove_dish_gravy_003',
      'remove_dish_gravy_004',
      'remove_dish_gravy_005',
      'remove_dish_gravy_006',
      'next_category',
    ];

    // Typing "1" should still resolve to the first list item for dish removal
    const result = resolveNumberedInput(undefined, '1', lastButtonIds);
    expect(result).toBe('remove_dish_gravy_001');
  });
});


// ============================================================
// Preservation Test 4.4
// **Validates: Requirements 3.6**
//
// PRESERVATION TEST: Expected to PASS on fixed code.
// Verifies that sendButtonMessage fallback numbering starts at 1
// when listItemCount is 0 (or undefined). This ensures backward
// compatibility — the fix only changes behavior when
// listItemCount > 0.
// ============================================================

describe('Preservation 4.4: sendButtonMessage fallback numbering starts at 1 when listItemCount is 0', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockContentCreate.mockClear();
    // Force quick-reply template creation to fail so we hit the fallback path
    mockContentCreate.mockRejectedValue(new Error('Content API error'));
    mockCreate.mockResolvedValue({ sid: 'SM123' });
  });

  it('fallback starts at "1." when listItemCount is 0', async () => {
    const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

    const body = 'Choose your cuisine:';
    const buttons = [
      { id: 'north_indian', title: 'North Indian' },
      { id: 'south_indian', title: 'South Indian' },
    ];

    await provider.sendButtonMessage('+919876543210', body, buttons, undefined, 0);

    const sentBody: string = mockCreate.mock.calls[0][0].body;
    expect(sentBody).toContain('1. North Indian');
    expect(sentBody).toContain('2. South Indian');
  });

  it('fallback starts at "1." when listItemCount is undefined', async () => {
    const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

    const body = 'Choose your diet:';
    const buttons = [
      { id: 'veg', title: 'Veg' },
      { id: 'non_veg', title: 'Non-Veg' },
    ];

    await provider.sendButtonMessage('+919876543210', body, buttons);

    const sentBody: string = mockCreate.mock.calls[0][0].body;
    expect(sentBody).toContain('1. Veg');
    expect(sentBody).toContain('2. Non-Veg');
  });

  it('fallback numbering is sequential starting from 1 with three buttons', async () => {
    const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

    const body = 'Pick a meal style:';
    const buttons = [
      { id: 'regular', title: 'Regular' },
      { id: 'health', title: 'Health' },
      { id: 'mixed', title: 'Mixed' },
    ];

    // 4+ buttons skip the quick-reply attempt entirely, so use 3 buttons
    // but force the template to fail
    await provider.sendButtonMessage('+919876543210', body, buttons, undefined, 0);

    const sentBody: string = mockCreate.mock.calls[0][0].body;
    expect(sentBody).toContain('1. Regular');
    expect(sentBody).toContain('2. Health');
    expect(sentBody).toContain('3. Mixed');
  });
});
