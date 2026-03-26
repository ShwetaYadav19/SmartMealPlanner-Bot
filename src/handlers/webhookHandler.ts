// WebhookHandler — thin wiring layer (no business logic)
// Connects the WhatsApp/Twilio delivery channel to the core BotEngine

import * as querystring from 'querystring';
import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { JsonMealRepository } from '../adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../adapters/jsonMealComponentRepository';
import { JsonRulesRepository } from '../adapters/jsonRulesRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { RazorpayPaymentProvider } from '../adapters/razorpayPaymentProvider';
import { mapWhatsAppToIntent } from '../intentMapper';
import { processIntent } from '../core/botEngine';
import { formatBotResponse, type FormattedMessage } from '../messageFormatter';
import { formatCookMessage } from '../messageFormatter';
import { loadConfig } from '../config';
import { ResponseType } from '../core/types';
import { sendWeeklyPlanImage, sendGroceryListImage } from '../core/imageSender';

// Minimal API Gateway types (avoids @types/aws-lambda dependency)
interface APIGatewayProxyEvent {
  body: string | null;
  isBase64Encoded?: boolean;
  headers: Record<string, string | undefined>;
}

interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
}

/**
 * If the user typed a number (e.g. "1", "2") and we have stored button IDs
 * from the previous response, resolve the number to the corresponding button
 * payload. This handles the Twilio numbered-text fallback for >3 buttons.
 *
 * Also supports multi-select: "1,3" or "1 3" resolves to multiple IDs
 * joined by commas.
 */
export function resolveNumberedInput(
  buttonPayload: string | undefined,
  body: string,
  lastButtonIds?: string[],
): string | undefined {
  // If there's already a real button payload, use it
  if (buttonPayload) return buttonPayload;

  // If no stored buttons, nothing to resolve
  if (!lastButtonIds || lastButtonIds.length === 0) return undefined;

  const trimmed = body.trim();

  // Try single number first
  const singleNum = parseInt(trimmed, 10);
  if (!isNaN(singleNum) && singleNum >= 1 && singleNum <= lastButtonIds.length && String(singleNum) === trimmed) {
    return lastButtonIds[singleNum - 1];
  }

  // Try multi-select: split by comma, space, or both
  const parts = trimmed.split(/[\s,]+/).filter(p => p.length > 0);
  if (parts.length > 1) {
    const resolvedIds: string[] = [];
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 1 || num > lastButtonIds.length || String(num) !== part) {
        return undefined; // Invalid number in the list — bail out
      }
      resolvedIds.push(lastButtonIds[num - 1]);
    }
    // Deduplicate while preserving order
    const unique = [...new Set(resolvedIds)];
    if (unique.length > 1) {
      return unique.join(',');
    }
    return unique[0];
  }

  return undefined;
}

import type { MessagingProvider } from '../core/ports';

/**
 * Sends a single FormattedMessage via the MessagingProvider.
 * Handles list items, buttons, and plain text.
 */
async function sendFormattedMessage(
  provider: MessagingProvider,
  to: string,
  msg: FormattedMessage,
): Promise<void> {
  if (msg.listItems && msg.listItems.length > 0) {
    const numberedItems = msg.listItems
      .map((it, i) => `${i + 1}. ${it.item}`)
      .join('\n');
    const bodyWithItems = `${msg.text}\n\n${numberedItems}\n\n_Reply with numbers to remove (e.g. 1,3)_`;

    if (msg.buttons && msg.buttons.length > 0) {
      await provider.sendButtonMessage(to, bodyWithItems, msg.buttons, undefined, msg.listItems.length);
    } else {
      await provider.sendTextMessage(to, bodyWithItems);
    }
  } else if (msg.buttons && msg.buttons.length > 0) {
    await provider.sendButtonMessage(to, msg.text, msg.buttons);
  } else {
    await provider.sendTextMessage(to, msg.text);
  }
}

export async function webhookHandler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Decode body (API Gateway may base64-encode it)
    let rawBody = event.body ?? '';
    if (event.isBase64Encoded && rawBody) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
    }

    // 2. Parse URL-encoded form body from Twilio
    const params = querystring.parse(rawBody);
    const from = typeof params.From === 'string' ? params.From : undefined;
    const body = typeof params.Body === 'string' ? params.Body : '';
    const buttonPayload = typeof params.ButtonPayload === 'string'
      ? params.ButtonPayload
      : undefined;

    // 3. Validate required fields
    if (!from) {
      return { statusCode: 400, body: 'Missing From field' };
    }

    // 4. Strip whatsapp: prefix to get the phone number
    const phoneNumber = from.replace(/^whatsapp:/, '');

    // 5. Load config and instantiate adapters
    const config = loadConfig();
    const userStateRepo = new DynamoDBUserStateRepository(config.dynamodbTable);
    const mealRepo = new JsonMealRepository();
    const mealComponentRepo = new JsonMealComponentRepository();
    const rulesRepo = new JsonRulesRepository();
    const paymentProvider = new RazorpayPaymentProvider(
      config.razorpayKeyId,
      config.razorpayKeySecret,
      config.razorpayPlanId,
    );
    const messagingProvider = new TwilioMessagingProvider(
      config.twilioAccountSid,
      config.twilioAuthToken,
      config.twilioSenderNumber,
    );

    // 6. Load user state
    const userState = await userStateRepo.getUser(phoneNumber);

    // 7. Determine conversation state
    const conversationState = userState?.conversationState ?? 'awaiting_cuisine';

    // 8. Map WhatsApp payload to core intent
    //    If the user typed a number and we have stored button IDs from the
    //    previous response, resolve the number to the corresponding button payload.
    const resolvedPayload = resolveNumberedInput(buttonPayload, body, userState?.lastButtonIds);
    const intent = mapWhatsAppToIntent(resolvedPayload, body, conversationState);

    console.log('[webhook]', phoneNumber, 'state:', conversationState, 'intent:', intent.intent, 'payload:', intent.payload ?? '-');

    // 9. Process intent through BotEngine
    const result = await processIntent(intent, userState, mealRepo, mealComponentRepo, phoneNumber, rulesRepo, paymentProvider);

    console.log('[webhook]', phoneNumber, 'response:', result.response.type, 'newState:', result.updatedState.conversationState);

    // 10. Format structured response for WhatsApp
    const formatted = formatBotResponse(result.response);

    // 10b. Store button IDs on state so numbered text input can be resolved next turn
    //      Collect button IDs from ALL messages (primary + follow-ups) so numbered
    //      text fallback resolves correctly when buttons are split across messages.
    const allIds: string[] = [];
    const allMessages = [formatted, ...(formatted.followUp ?? [])];
    for (const msg of allMessages) {
      if (msg.listItems && msg.listItems.length > 0) {
        allIds.push(...msg.listItems.map(li => li.id));
      }
      if (msg.buttons && msg.buttons.length > 0) {
        allIds.push(...msg.buttons.map(b => b.id));
      }
    }
    result.updatedState.lastButtonIds = allIds.length > 0 ? allIds : undefined;

    // 11. Determine if this response type gets an image instead of text
    const rtype = result.response.type;
    const rdata = result.response.data;
    const imageResponseTypes = new Set([
      ResponseType.WEEKLY_PLAN,
      ResponseType.WEEKLY_REMINDER,
      ResponseType.ENTIRE_PLAN_PREVIEW,
      ResponseType.WEEKLY_GROCERY_LIST,
      ResponseType.TOMORROW_GROCERY_LIST,
    ]);
    const shouldSendImage = imageResponseTypes.has(rtype);
    let imageSent = false;

    if (shouldSendImage) {
      try {
        if ((rtype === ResponseType.WEEKLY_PLAN || rtype === ResponseType.WEEKLY_REMINDER || rtype === ResponseType.ENTIRE_PLAN_PREVIEW) && rdata?.weeklyPlan) {
          await sendWeeklyPlanImage(messagingProvider, phoneNumber, rdata.weeklyPlan, 'Here is your weekly meal plan 🍽️');
          imageSent = true;
        }
        if ((rtype === ResponseType.WEEKLY_GROCERY_LIST || rtype === ResponseType.TOMORROW_GROCERY_LIST) && rdata?.groceryList) {
          const groceryCaption = rtype === ResponseType.TOMORROW_GROCERY_LIST
            ? "Here is tomorrow's grocery list 🛒"
            : 'Here is your weekly grocery list 🛒';
          await sendGroceryListImage(messagingProvider, phoneNumber, rdata.groceryList, groceryCaption);
          imageSent = true;
        }
      } catch (imgErr) {
        console.error(`[imageSender] Image failed, falling back to text:`, imgErr);
      }
    }

    // Send text + follow-ups only if image wasn't sent
    if (!imageSent) {
      await sendFormattedMessage(messagingProvider, phoneNumber, formatted);
      if (formatted.followUp) {
        for (const followUpMsg of formatted.followUp) {
          await sendFormattedMessage(messagingProvider, phoneNumber, followUpMsg);
        }
      }
    } else if (formatted.followUp) {
      // Send follow-ups that have buttons (e.g. "What do you think?")
      for (const followUpMsg of formatted.followUp) {
        if (followUpMsg.buttons && followUpMsg.buttons.length > 0) {
          await sendFormattedMessage(messagingProvider, phoneNumber, followUpMsg);
        }
      }
    }

    // 11b. If cook message was sent, also send to cook
    if (
      result.response.type === ResponseType.COOK_MESSAGE_SENT &&
      result.response.data?.dayPlan &&
      result.response.data?.cookNumber
    ) {
      const cookMessage = formatCookMessage(result.response.data.dayPlan);
      await messagingProvider.sendTextMessage(
        result.response.data.cookNumber,
        cookMessage,
      );
    }

    // 12. Save updated state
    await userStateRepo.saveUser(result.updatedState);

    // 13. Return 200 to Twilio
    return { statusCode: 200, body: '' };
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Log the stack trace separately for CloudWatch readability
    if (error instanceof Error) {
      console.error('[webhook] stack:', error.stack);
    }
    return { statusCode: 500, body: '' };
  }
}

// Export as both named and default handler for flexibility
export const handler = webhookHandler;
