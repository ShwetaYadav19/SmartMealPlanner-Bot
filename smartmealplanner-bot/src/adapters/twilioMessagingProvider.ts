import Twilio from 'twilio';
import type { MessagingProvider, ButtonOption } from '../core/ports';

/**
 * Resolves a Twilio Content Template SID for a given purpose.
 * Delegates to getTemplateSid from src/messages.ts when available.
 * Can be overridden for testing or when messages module is not yet created.
 */
export type TemplateSidResolver = (purpose: string) => string | undefined;

export class TwilioMessagingProvider implements MessagingProvider {
  private readonly client: ReturnType<typeof Twilio>;
  private readonly senderNumber: string;
  private readonly templateSidResolver?: TemplateSidResolver;

  constructor(
    accountSid: string,
    authToken: string,
    senderNumber: string,
    templateSidResolver?: TemplateSidResolver,
  ) {
    this.client = Twilio(accountSid, authToken);
    this.senderNumber = senderNumber;
    this.templateSidResolver = templateSidResolver;
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
    templatePurpose?: string,
  ): Promise<void> {
    const from = `whatsapp:${this.senderNumber}`;
    const toWhatsApp = `whatsapp:${to}`;

    // When a templatePurpose is provided, try to resolve a Twilio Content Template SID
    if (templatePurpose && this.templateSidResolver) {
      const contentSid = this.templateSidResolver(templatePurpose);
      if (contentSid) {
        await this.client.messages.create({
          from,
          to: toWhatsApp,
          contentSid,
        });
        return;
      }
    }

    // Fall back to inline button construction
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
}
