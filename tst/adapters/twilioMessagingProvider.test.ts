import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock twilio before importing the provider
const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' });

vi.mock('twilio', () => ({
  default: () => ({
    messages: { create: mockCreate },
  }),
}));

import { TwilioMessagingProvider } from '../../src/adapters/twilioMessagingProvider';
import type { TemplateSidResolver } from '../../src/adapters/twilioMessagingProvider';

const TEMPLATE_SIDS: Record<string, string> = {
  main_menu: 'HXe992435f98fde5249c641a135bb5dbd5',
  diet_selection: 'HX5ad138d83501b0b1111e0a19a524dfd5',
};

const mockResolver: TemplateSidResolver = (purpose) => TEMPLATE_SIDS[purpose];

describe('TwilioMessagingProvider', () => {
  beforeEach(() => {
    mockCreate.mockClear();
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

    it('uses contentSid when templatePurpose resolves to a SID', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740', mockResolver);

      await provider.sendButtonMessage(
        '+919876543210',
        'What would you like to do?',
        buttons,
        'main_menu',
      );

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+17655483740',
        to: 'whatsapp:+919876543210',
        contentSid: 'HXe992435f98fde5249c641a135bb5dbd5',
      });
    });

    it('falls back to inline buttons when no templatePurpose is provided', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740', mockResolver);

      await provider.sendButtonMessage('+919876543210', 'Pick one:', buttons);

      expect(mockCreate).toHaveBeenCalledOnce();
      const call = mockCreate.mock.calls[0][0];
      expect(call.from).toBe('whatsapp:+17655483740');
      expect(call.to).toBe('whatsapp:+919876543210');
      expect(call.body).toContain('Pick one:');
      expect(call.body).toContain('1. Weekly Meal Plan');
      expect(call.body).toContain('2. Swap Lunch');
      expect(call.contentSid).toBeUndefined();
    });

    it('falls back to inline buttons when templatePurpose does not resolve', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740', mockResolver);

      await provider.sendButtonMessage('+919876543210', 'Choose:', buttons, 'unknown_purpose');

      expect(mockCreate).toHaveBeenCalledOnce();
      const call = mockCreate.mock.calls[0][0];
      expect(call.body).toContain('Choose:');
      expect(call.body).toContain('1. Weekly Meal Plan');
      expect(call.contentSid).toBeUndefined();
    });

    it('falls back to inline buttons when no resolver is provided', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740');

      await provider.sendButtonMessage('+919876543210', 'Menu:', buttons, 'main_menu');

      expect(mockCreate).toHaveBeenCalledOnce();
      const call = mockCreate.mock.calls[0][0];
      expect(call.body).toContain('Menu:');
      expect(call.body).toContain('1. Weekly Meal Plan');
      expect(call.contentSid).toBeUndefined();
    });

    it('uses contentSid for diet_selection template', async () => {
      const provider = new TwilioMessagingProvider('AC_test', 'auth_test', '+17655483740', mockResolver);

      await provider.sendButtonMessage(
        '+919876543210',
        'Diet?',
        [{ id: 'veg', title: 'Veg' }],
        'diet_selection',
      );

      expect(mockCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+17655483740',
        to: 'whatsapp:+919876543210',
        contentSid: 'HX5ad138d83501b0b1111e0a19a524dfd5',
      });
    });
  });
});
