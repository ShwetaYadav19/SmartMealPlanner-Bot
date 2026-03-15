import Twilio from 'twilio';
import type { MessagingProvider, ButtonOption } from '../core/ports';

/**
 * TwilioMessagingProvider — sends WhatsApp messages via Twilio.
 *
 * For in-session messages with ≤3 buttons, creates on-the-fly
 * twilio/quick-reply Content Templates via the Content API
 * (no WhatsApp approval needed within the 24-hour session window).
 *
 * For out-of-session messages (reminders), callers can pass a pre-approved
 * contentSid directly to bypass on-the-fly creation.
 *
 * Falls back to numbered text buttons when:
 * - More than 3 buttons (WhatsApp in-session limit)
 * - Content API call fails for any reason
 */
export class TwilioMessagingProvider implements MessagingProvider {
  private readonly client: ReturnType<typeof Twilio>;
  private readonly senderNumber: string;

  constructor(
    accountSid: string,
    authToken: string,
    senderNumber: string,
  ) {
    this.client = Twilio(accountSid, authToken);
    this.senderNumber = senderNumber;
  }

  async sendTextMessage(to: string, body: string): Promise<void> {
    await this.client.messages.create({
      from: `whatsapp:${this.senderNumber}`,
      to: `whatsapp:${to}`,
      body,
    });
  }

  async sendButtonMessage(
    to: string,
    body: string,
    buttons: ButtonOption[],
    contentSid?: string,
  ): Promise<void> {
    const from = `whatsapp:${this.senderNumber}`;
    const toWhatsApp = `whatsapp:${to}`;

    // If a pre-approved contentSid is provided (e.g. for out-of-session reminders), use it directly
    if (contentSid) {
      try {
        await this.client.messages.create({
          from,
          to: toWhatsApp,
          contentSid,
        });
        return;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `Pre-approved template failed contentSid="${contentSid}" to="${toWhatsApp}": ${errMsg}. Falling back to text.`,
        );
      }
    }

    // Try interactive quick-reply for ≤3 buttons (WhatsApp in-session limit)
    if (!contentSid && buttons.length >= 1 && buttons.length <= 3) {
      try {
        const sid = await this.createQuickReplyTemplate(body, buttons);
        await this.client.messages.create({
          from,
          to: toWhatsApp,
          contentSid: sid,
        });
        return;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `Quick-reply template failed for to="${toWhatsApp}" buttons=${buttons.length}: ${errMsg}. Falling back to text.`,
        );
      }
    }

    // Fallback: numbered text buttons
    const buttonText = buttons
      .map((b, i) => `${i + 1}. ${b.title}`)
      .join('\n');
    const fullBody = `${body}\n\n${buttonText}`;

    await this.client.messages.create({
      from,
      to: toWhatsApp,
      body: fullBody,
    });
  }

  /**
   * Creates a twilio/quick-reply Content Template on-the-fly.
   * These don't need WhatsApp approval for in-session messages.
   */
  private async createQuickReplyTemplate(
    body: string,
    buttons: ButtonOption[],
  ): Promise<string> {
    const actions = buttons.map((b) => ({
      type: 'QUICK_REPLY' as const,
      title: b.title.slice(0, 20), // WhatsApp limit: 20 chars
      id: b.id,
    }));

    // Generate a unique friendly name to avoid collisions
    const friendlyName = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const template = await this.client.content.v1.contents.create({
      friendlyName,
      language: 'en',
      types: {
        'twilio/quick-reply': {
          body,
          actions,
        },
      },
    } as any);

    return template.sid;
  }
}
