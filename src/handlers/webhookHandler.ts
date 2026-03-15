// WebhookHandler — thin wiring layer (no business logic)
// Connects the WhatsApp/Twilio delivery channel to the core BotEngine

import * as querystring from 'querystring';
import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { JsonMealRepository } from '../adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../adapters/jsonMealComponentRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { mapWhatsAppToIntent } from '../intentMapper';
import { processIntent } from '../core/botEngine';
import { formatBotResponse } from '../messageFormatter';
import { formatCookMessage } from '../messageFormatter';
import { loadConfig } from '../config';
import { ResponseType } from '../core/types';

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
 */
function resolveNumberedInput(
  buttonPayload: string | undefined,
  body: string,
  lastButtonIds?: string[],
): string | undefined {
  // If there's already a real button payload, use it
  if (buttonPayload) return buttonPayload;

  // If no stored buttons, nothing to resolve
  if (!lastButtonIds || lastButtonIds.length === 0) return undefined;

  const trimmed = body.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= lastButtonIds.length && String(num) === trimmed) {
    return lastButtonIds[num - 1];
  }

  return undefined;
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

    // 9. Process intent through BotEngine
    const result = await processIntent(intent, userState, mealRepo, mealComponentRepo, phoneNumber);

    // 10. Format structured response for WhatsApp
    const formatted = formatBotResponse(result.response);

    // 10b. Store button IDs on state so numbered text input can be resolved next turn
    if (formatted.buttons && formatted.buttons.length > 0) {
      result.updatedState.lastButtonIds = formatted.buttons.map(b => b.id);
    } else {
      result.updatedState.lastButtonIds = undefined;
    }

    // 11. Send message via MessagingProvider
    if (formatted.buttons && formatted.buttons.length > 0) {
      await messagingProvider.sendButtonMessage(
        phoneNumber,
        formatted.text,
        formatted.buttons,
      );
    } else {
      await messagingProvider.sendTextMessage(phoneNumber, formatted.text);
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
    return { statusCode: 500, body: '' };
  }
}

// Export as both named and default handler for flexibility
export const handler = webhookHandler;
