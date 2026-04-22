import Twilio from 'twilio';
import type { MessagingProvider, ButtonOption, ListItem } from '../core/ports';

/**
 * TwilioMessagingProvider — sends WhatsApp messages via Twilio.
 *
 * For out-of-session messages (reminders), callers pass a pre-approved
 * contentSid. If the primary template fails, a simpler fallback template
 * (no variables) is tried before giving up.
 *
 * For in-session messages with ≤3 buttons, creates on-the-fly
 * twilio/quick-reply Content Templates via the Content API.
 * Templates are awaited-deleted after send with a retry, and orphan SIDs
 * are logged as errors so they can be tracked and cleaned up.
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

  async sendTextMessage(
    to: string,
    body: string,
    contentSid?: string,
    contentVariables?: Record<string, string>,
    fallbackContentSid?: string,
  ): Promise<string | void> {
    // For out-of-session messages, use a pre-approved template if provided.
    // If the primary template fails (bad variables, etc.), try a simpler fallback template.
    // Do NOT fall back to freeform — outside the 24h window it will always fail with 63016.
    if (contentSid) {
      try {
        const params: Record<string, unknown> = {
          from: `whatsapp:${this.senderNumber}`,
          to: `whatsapp:${to}`,
          contentSid,
        };
        if (contentVariables && Object.keys(contentVariables).length > 0) {
          params.contentVariables = JSON.stringify(contentVariables);
        }
        const msg = await this.client.messages.create(params as any);
        return msg.sid;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `Template send failed contentSid="${contentSid}" to="whatsapp:${to}": ${errMsg}.` +
          (fallbackContentSid ? ' Trying fallback template.' : ' No fallback template configured.'),
        );
        if (!fallbackContentSid) throw error;
      }

      // Fallback: simpler template with no variables
      const msg = await this.client.messages.create({
        from: `whatsapp:${this.senderNumber}`,
        to: `whatsapp:${to}`,
        contentSid: fallbackContentSid,
      } as any);
      return msg.sid;
    }

    const MAX_LEN = 1500; // Twilio WhatsApp enforces 1600-char limit per message
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

  async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<void> {
    const params: Record<string, unknown> = {
      from: `whatsapp:${this.senderNumber}`,
      to: `whatsapp:${to}`,
      mediaUrl: [imageUrl],
    };
    if (caption) params.body = caption;
    const msg = await this.client.messages.create(params as any);

    // Poll until Twilio confirms the message left the queue
    // so the next message arrives in order on WhatsApp
    await this.waitForSent(msg.sid);
  }

  async sendAudioMessage(to: string, audioUrl: string): Promise<void> {
    const msg = await this.client.messages.create({
      from: `whatsapp:${this.senderNumber}`,
      to: `whatsapp:${to}`,
      mediaUrl: [audioUrl],
    } as any);

    // Wait for delivery so the next message arrives in order on WhatsApp
    await this.waitForSent(msg.sid);
  }

  async sendVCardMessage(to: string, vcfUrl: string): Promise<void> {
    const msg = await this.client.messages.create({
      from: `whatsapp:${this.senderNumber}`,
      to: `whatsapp:${to}`,
      mediaUrl: [vcfUrl],
    } as any);
    await this.waitForSent(msg.sid);
  }

  /**
   * Polls a message's status until it progresses past 'queued'/'accepted'.
   * Twilio statuses: queued → accepted → sending → sent → delivered / failed / undelivered
   * We wait for 'delivered' or a terminal failure so the next message arrives
   * in order on WhatsApp.  Falls back to 'sent' if delivery confirmation
   * doesn't arrive within the first pass, to avoid blocking indefinitely.
   */
  async waitForSent(messageSid: string, maxAttempts = 15): Promise<void> {
    const deliveredStatuses = new Set(['delivered', 'read', 'failed', 'undelivered']);
    const sentOrBeyond = new Set(['sent', 'delivered', 'read', 'failed', 'undelivered']);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const msg = await this.client.messages(messageSid).fetch();
        if (deliveredStatuses.has(msg.status)) return;
        // After 10 attempts, accept 'sent' to avoid blocking too long
        if (i >= 10 && sentOrBeyond.has(msg.status)) return;
      } catch {
        // Fetch failed — don't block, just proceed
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Timed out — proceed anyway
  }

  async sendButtonMessage(
    to: string,
    body: string,
    buttons: ButtonOption[],
    contentSid?: string,
    listItemCount?: number,
    contentVariables?: Record<string, string>,
    fallbackContentSid?: string,
  ): Promise<void> {
    const from = `whatsapp:${this.senderNumber}`;
    const toWhatsApp = `whatsapp:${to}`;

    // If a pre-approved contentSid is provided (e.g. for out-of-session reminders), use it directly.
    // If it fails (bad variables, etc.), try a simpler fallback template.
    // Do NOT fall back to freeform — outside the 24h window it will always fail with 63016.
    if (contentSid) {
      try {
        const params: Record<string, unknown> = {
          from,
          to: toWhatsApp,
          contentSid,
        };
        if (contentVariables && Object.keys(contentVariables).length > 0) {
          params.contentVariables = JSON.stringify(contentVariables);
        }
        await this.client.messages.create(params as any);
        return;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `Pre-approved template failed contentSid="${contentSid}" to="${toWhatsApp}": ${errMsg}.` +
          (fallbackContentSid ? ' Trying fallback template.' : ' No fallback template configured.'),
        );
        if (!fallbackContentSid) throw error;
      }

      // Fallback: simpler template with no variables
      await this.client.messages.create({
        from,
        to: toWhatsApp,
        contentSid: fallbackContentSid,
      } as any);
      return;
    }

    // In-session: try interactive quick-reply for ≤3 buttons
    // Skip for long messages — WhatsApp template body limit is 1024 chars
    if (buttons.length >= 1 && buttons.length <= 3 && body.length <= 900) {
      try {
        const sid = await this.createQuickReplyTemplate(body, buttons);
        try {
          await this.client.messages.create({
            from,
            to: toWhatsApp,
            contentSid: sid,
          });
        } finally {
          await this.deleteContentTemplate(sid);
        }
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
      try {
        await this.client.messages.create({
          from,
          to: toWhatsApp,
          contentSid: sid,
        });
      } finally {
        await this.deleteContentTemplate(sid);
      }
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
   * Deletes a Content Template created for in-session use.
   * Awaits the delete, retries once on failure, and logs the orphan SID
   * as an error if cleanup still fails so it can be tracked.
   */
  private async deleteContentTemplate(sid: string): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.client.content.v1.contents(sid).remove();
        return;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (attempt < 2) {
          console.warn(`[template-cleanup] Retry delete for sid="${sid}": ${errMsg}`);
          await new Promise((r) => setTimeout(r, 500));
        } else {
          console.error(`[template-cleanup] ORPHANED template sid="${sid}" — manual cleanup required: ${errMsg}`);
        }
      }
    }
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
