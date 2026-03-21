import Twilio from 'twilio';
import type { MessagingProvider, ButtonOption, ListItem } from '../core/ports';

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
    const MAX_LEN = 1500; // Stay under Twilio's 1600-char concatenated limit
    if (body.length <= MAX_LEN) {
      await this.client.messages.create({
        from: `whatsapp:${this.senderNumber}`,
        to: `whatsapp:${to}`,
        body,
      });
      return;
    }

    // Split on double-newline boundaries to keep logical sections together
    const chunks = this.splitMessage(body, MAX_LEN);
    for (const chunk of chunks) {
      await this.client.messages.create({
        from: `whatsapp:${this.senderNumber}`,
        to: `whatsapp:${to}`,
        body: chunk,
      });
    }
  }

  /**
   * Splits a long message into chunks at paragraph boundaries (\n\n).
   * Falls back to single-newline splits, then hard cuts if needed.
   */
  private splitMessage(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      // Try to split at a double-newline within the limit
      let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
      if (splitIdx <= 0) {
        // Fall back to single newline
        splitIdx = remaining.lastIndexOf('\n', maxLen);
      }
      if (splitIdx <= 0) {
        // Hard cut as last resort
        splitIdx = maxLen;
      }
      chunks.push(remaining.slice(0, splitIdx).trimEnd());
      remaining = remaining.slice(splitIdx).trimStart();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }
    return chunks;
  }

  async sendButtonMessage(
    to: string,
    body: string,
    buttons: ButtonOption[],
    contentSid?: string,
    listItemCount?: number,
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
    // Skip template for long messages — WhatsApp template body limit is 1024 chars
    if (!contentSid && buttons.length >= 1 && buttons.length <= 3 && body.length <= 900) {
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
    const offset = listItemCount ?? 0;
    const buttonText = buttons
      .map((b, i) => `${offset + i + 1}. ${b.title}`)
      .join('\n');
    const fullBody = `${body}\n\n${buttonText}`;

    await this.client.messages.create({
      from,
      to: toWhatsApp,
      body: fullBody,
    });
  }

  /**
   * Sends a WhatsApp list-picker message via the Content API.
   * Supports up to 10 tappable items in a dropdown menu.
   * Falls back to numbered text if the Content API call fails.
   */
  async sendListMessage(
    to: string,
    body: string,
    buttonLabel: string,
    items: ListItem[],
  ): Promise<void> {
    const from = `whatsapp:${this.senderNumber}`;
    const toWhatsApp = `whatsapp:${to}`;

    // WhatsApp list-picker supports max 10 items
    const cappedItems = items.slice(0, 10);

    try {
      const sid = await this.createListPickerTemplate(body, buttonLabel, cappedItems);
      await this.client.messages.create({
        from,
        to: toWhatsApp,
        contentSid: sid,
      });
      return;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `List-picker template failed for to="${toWhatsApp}" items=${cappedItems.length}: ${errMsg}. Falling back to text.`,
      );
    }

    // Fallback: numbered text
    const itemText = cappedItems
      .map((it, i) => `${i + 1}. ${it.item}`)
      .join('\n');
    const fullBody = `${body}\n\n${itemText}`;

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

  /**
   * Creates a twilio/list-picker Content Template on-the-fly.
   * Supports up to 10 items in a tappable dropdown menu.
   */
  private async createListPickerTemplate(
    body: string,
    buttonLabel: string,
    items: ListItem[],
  ): Promise<string> {
    const listItems = items.map((it) => ({
      item: it.item.slice(0, 24), // WhatsApp limit: 24 chars
      id: it.id,
      description: it.description?.slice(0, 72) ?? '',
    }));

    const friendlyName = `lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const template = await this.client.content.v1.contents.create({
      friendlyName,
      language: 'en',
      types: {
        'twilio/list-picker': {
          body,
          button: buttonLabel.slice(0, 20),
          items: listItems,
        },
      },
    } as any);

    return template.sid;
  }
}
