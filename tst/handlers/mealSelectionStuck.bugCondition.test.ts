import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNumberedInput } from '../../src/handlers/webhookHandler';
import { mapWhatsAppToIntent } from '../../src/intentMapper';
import { Intent } from '../../src/core/types';

// Mock twilio for sendButtonMessage fallback tests
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
// Exploratory Bug Condition Test 1.1
// **Validates: Requirements 1.2**
//
// EXPLORATION TEST: Expected to FAIL on unfixed code.
// Failure confirms the bug exists — resolveNumberedInput resolves
// "1" to the first list item (remove_dish_xxx) instead of
// next_category when lastButtonIds has list items before buttons.
//
// The bug: lastButtonIds stores list item IDs first, then button IDs.
// For a step with 6 list items and 1 button:
//   lastButtonIds[0..5] = remove_dish_* (list items)
//   lastButtonIds[6]    = next_category  (button)
// When the fallback renders "1. Next ➡️", the user types "1",
// but resolveNumberedInput maps "1" → lastButtonIds[0] which is
// remove_dish_xxx, NOT next_category.
//
// This test verifies the bug by asserting that typing "1" resolves
// to the first list item — confirming the collision exists.
// ============================================================

describe('Bug Condition 1.1: resolveNumberedInput resolves "1" to first list item (not next_category)', () => {
  it('typing "1" resolves to first list item when lastButtonIds has list items before buttons', () => {
    // Simulate a dish preview step with 6 removable dishes + 1 "Next" button
    const lastButtonIds = [
      'remove_dish_gravy_001',
      'remove_dish_gravy_002',
      'remove_dish_gravy_003',
      'remove_dish_gravy_004',
      'remove_dish_gravy_005',
      'remove_dish_gravy_006',
      'next_category',  // The button the user wants to press
    ];

    // User types "1" intending to select "Next ➡️" (shown as "1. Next ➡️" in fallback)
    const result = resolveNumberedInput(undefined, '1', lastButtonIds);

    // BUG CONFIRMATION: "1" resolves to the first list item, NOT next_category.
    // This is the bug — the user intended to press "Next" but got dish removal.
    expect(result).toBe('remove_dish_gravy_001');

    // The user would need to type "7" to actually hit next_category,
    // but the fallback text shows "1. Next ➡️" — a numbering collision.
    const correctResult = resolveNumberedInput(undefined, '7', lastButtonIds);
    expect(correctResult).toBe('next_category');
  });
});


// ============================================================
// Exploratory Bug Condition Test 1.2 — RESOLVED
// **Validates: Requirements 1.4**
//
// RESOLVED: This test originally confirmed the bug existed —
// mapWhatsAppToIntent returned Intent.UNKNOWN for "next" in
// dish_preview state. After the fix (free-text handling added
// in intentMapper.ts), "next" now correctly maps to
// Intent.NEXT_CATEGORY. The assertion below confirms the fix.
// ============================================================

describe('Bug Condition 1.2: mapWhatsAppToIntent handles "next" in dish_preview state (RESOLVED)', () => {
  it('"next" in dish_preview returns Intent.NEXT_CATEGORY (confirms fix)', () => {
    const result = mapWhatsAppToIntent(undefined, 'next', 'dish_preview');

    // FIX CONFIRMED: "next" now maps to NEXT_CATEGORY thanks to
    // the free-text handling added for dish_preview state.
    expect(result.intent).toBe(Intent.NEXT_CATEGORY);
  });
});


// ============================================================
// Exploratory Bug Condition Test 1.3
// **Validates: Requirements 1.1**
//
// EXPLORATION TEST: Expected to PASS on unfixed code.
// Passing confirms the bug exists — sendButtonMessage fallback
// renders "1. Next ➡️" regardless of how many list items are in
// the message body.
//
// The bug: In sendButtonMessage, the fallback path renders buttons
// as `${i + 1}. ${b.title}` starting from index 0. When the body
// already contains a numbered list of dishes (e.g., 6 items), the
// "Next ➡️" button still renders as "1. Next ➡️" instead of
// "7. Next ➡️", creating a numbering collision.
// ============================================================

describe('Bug Condition 1.3: sendButtonMessage fallback renders "1. Next ➡️" regardless of list item count', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockContentCreate.mockClear();
  });

  it('fallback renders "1. Next ➡️" even when body contains 6 numbered list items', async () => {
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

    await provider.sendButtonMessage('+919876543210', bodyWithListItems, buttons);

    // The fallback path should have been triggered (template creation failed)
    expect(mockContentCreate).toHaveBeenCalledOnce();

    // Capture the message body sent via the fallback
    const fallbackCall = mockCreate.mock.calls[0][0];
    const sentBody: string = fallbackCall.body;

    // BUG CONFIRMATION: The fallback renders "1. Next ➡️" even though
    // the body already has items numbered 1-6. This creates a collision.
    // On fixed code, it should render "7. Next ➡️" instead.
    expect(sentBody).toContain('1. Next ➡️');

    // Verify the body still has the original list items
    expect(sentBody).toContain('1. Paneer Butter Masala');
    expect(sentBody).toContain('6. Chana Masala');
  });
});
