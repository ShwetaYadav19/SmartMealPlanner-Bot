import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock twilio before importing the provider
const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' });
const mockContentCreate = vi.fn().mockResolvedValue({ sid: 'HX_DYNAMIC_123' });

vi.mock('twilio', () => ({
  default: () => ({
    messages: { create: mockCreate },
    content: { v1: { contents: { create: mockContentCreate } } },
  }),
}));

import { TwilioMessagingProvider } from '../../src/adapters/twilioMessagingProvider';

describe('TwilioMessagingProvider', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockContentCreate.mockClear();
    mockContentCreate.mockResolvedValue({ sid: 'HX_DYNAMIC_123' });
  });

  describe('sendTextMessage', () => {
    it('sends a text message with whatsapp: prefix on from and to', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');
      await provider.sendTextMessage('+919876543210', 'Hello!');

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+17655483740',
        to: 'whatsapp:+919876543210',
        body: 'Hello!',
      });
    });
  });

  describe('sendButtonMessage', () => {
    const buttons = [
      { id: 'weekly_plan', title: 'Weekly Meal Plan' },
      { id: 'swap_lunch', title: 'Swap Lunch' },
    ];

    it('uses pre-approved contentSid when provided directly', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage(
        '+919876543210',
        'What would you like to do?',
        buttons,
        'HX_PREAPPROVED_SID',
      );

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+17655483740',
        to: 'whatsapp:+919876543210',
        contentSid: 'HX_PREAPPROVED_SID',
      });
      // Should NOT create an on-the-fly template
      expect(mockContentCreate).not.toHaveBeenCalled();
    });

    it('creates on-the-fly quick-reply template for ≤3 buttons when no contentSid', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage('+919876543210', 'Pick one:', buttons);

      // Should create a quick-reply template
      expect(mockContentCreate).toHaveBeenCalledOnce();
      const createCall = mockContentCreate.mock.calls[0][0];
      expect(createCall.language).toBe('en');
      expect(createCall.types['twilio/quick-reply'].body).toBe('Pick one:');
      expect(createCall.types['twilio/quick-reply'].actions).toHaveLength(2);

      // Should send using the dynamic contentSid
      expect(mockCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+17655483740',
        to: 'whatsapp:+919876543210',
        contentSid: 'HX_DYNAMIC_123',
      });
    });

    it('falls back to numbered text when >3 buttons', async () => {
      const manyButtons = [
        { id: 'a', title: 'Option A' },
        { id: 'b', title: 'Option B' },
        { id: 'c', title: 'Option C' },
        { id: 'd', title: 'Option D' },
      ];
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage('+919876543210', 'Menu:', manyButtons);

      expect(mockContentCreate).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledOnce();
      const call = mockCreate.mock.calls[0][0];
      expect(call.body).toContain('Menu:');
      expect(call.body).toContain('1. Option A');
      expect(call.body).toContain('4. Option D');
      expect(call.contentSid).toBeUndefined();
    });

    it('falls back to numbered text when quick-reply creation fails', async () => {
      mockContentCreate.mockRejectedValueOnce(new Error('Content API error'));
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage('+919876543210', 'Choose:', buttons);

      // Should have tried to create template
      expect(mockContentCreate).toHaveBeenCalledOnce();
      // Should fall back to text
      const call = mockCreate.mock.calls[0][0];
      expect(call.body).toContain('Choose:');
      expect(call.body).toContain('1. Weekly Meal Plan');
      expect(call.body).toContain('2. Swap Lunch');
    });

    it('falls back to numbered text when pre-approved template send fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Template send failed'));
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage('+919876543210', 'Menu:', buttons, 'HX_BAD_SID');

      // First call fails (template), second call succeeds (text fallback)
      expect(mockCreate).toHaveBeenCalledTimes(2);
      const fallbackCall = mockCreate.mock.calls[1][0];
      expect(fallbackCall.body).toContain('Menu:');
      expect(fallbackCall.body).toContain('1. Weekly Meal Plan');
    });

    it('truncates button titles to 20 chars for quick-reply', async () => {
      const longButtons = [
        { id: 'long', title: 'This is a very long button title that exceeds limit' },
      ];
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage('+919876543210', 'Pick:', longButtons);

      const createCall = mockContentCreate.mock.calls[0][0];
      const action = createCall.types['twilio/quick-reply'].actions[0];
      expect(action.title.length).toBeLessThanOrEqual(20);
    });
  });
});
