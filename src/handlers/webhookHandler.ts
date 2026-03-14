// WebhookHandler — thin wiring layer (no business logic)
// Connects the WhatsApp/Twilio delivery channel to the core BotEngine

import * as querystring from 'querystring';
import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { JsonMealRepository } from '../adapters/jsonMealRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { mapWhatsAppToIntent } from '../intentMapper';
import { processIntent } from '../core/botEngine';
import { formatBotResponse } from '../messageFormatter';
import { formatCookMessage } from '../messageFormatter';
import { loadConfig } from '../config';
import { getTemplateSid } from '../messages';
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
    // Skip Twilio content templates for sandbox numbers (they don't support templates)
    const isSandbox = config.twilioSenderNumber === '+14155238886';
    const templateResolver = isSandbox
      ? undefined
      : (purpose: string) => getTemplateSid(purpose as Parameters<typeof getTemplateSid>[0]);
    const messagingProvider = new TwilioMessagingProvider(
      config.twilioAccountSid,
      config.twilioAuthToken,
      config.twilioSenderNumber,
      templateResolver,
    );

    // 6. Load user state
    const userState = await userStateRepo.getUser(phoneNumber);

    // 7. Determine conversation state
    const conversationState = userState?.conversationState ?? 'awaiting_cuisine';

    // 8. Map WhatsApp payload to core intent
    const intent = mapWhatsAppToIntent(buttonPayload, body, conversationState);

    // 9. Process intent through BotEngine
    const result = await processIntent(intent, userState, mealRepo, phoneNumber);

    // 10. Format structured response for WhatsApp
    const formatted = formatBotResponse(result.response);

    // 11. Send message via MessagingProvider
    if (formatted.buttons && formatted.buttons.length > 0) {
      await messagingProvider.sendButtonMessage(
        phoneNumber,
        formatted.text,
        formatted.buttons,
        formatted.templatePurpose,
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
