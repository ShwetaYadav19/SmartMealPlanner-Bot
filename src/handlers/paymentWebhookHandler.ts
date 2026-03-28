// Payment Webhook Handler — processes Razorpay payment callbacks
// Activates user subscription and triggers plan generation on successful payment

import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { JsonMealRepository } from '../adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../adapters/jsonMealComponentRepository';
import { JsonRulesRepository } from '../adapters/jsonRulesRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { RazorpayPaymentProvider } from '../adapters/razorpayPaymentProvider';
import { CloudWatchMetricsAdapter } from '../adapters/cloudwatchMetricsAdapter';
import { processIntent } from '../core/botEngine';
import { formatBotResponse } from '../messageFormatter';
import { loadConfig } from '../config';
import { Intent, type UserState } from '../core/types';
import type { MessagingProvider, MetricsPort } from '../core/ports';

interface APIGatewayProxyEvent {
  body: string | null;
  isBase64Encoded?: boolean;
  headers: Record<string, string | undefined>;
}

interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    subscription?: {
      entity: {
        id: string;
        status: string;
        current_end?: number;
        notes?: { phone_number?: string };
      };
    };
    payment?: {
      entity: {
        id: string;
        notes?: { phone_number?: string };
      };
    };
  };
}

async function sendFormattedResponse(
  provider: MessagingProvider,
  to: string,
  response: ReturnType<typeof formatBotResponse>,
): Promise<void> {
  if (response.buttons && response.buttons.length > 0) {
    await provider.sendButtonMessage(to, response.text, response.buttons);
  } else {
    await provider.sendTextMessage(to, response.text);
  }
  if (response.followUp) {
    for (const followUp of response.followUp) {
      if (followUp.buttons && followUp.buttons.length > 0) {
        await provider.sendButtonMessage(to, followUp.text, followUp.buttons);
      } else {
        await provider.sendTextMessage(to, followUp.text);
      }
    }
  }
}

export async function paymentWebhookHandler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const metricsPort: MetricsPort = new CloudWatchMetricsAdapter();

  try {
    let rawBody = event.body ?? '';
    if (event.isBase64Encoded && rawBody) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
    }

    const config = loadConfig();
    const paymentProvider = new RazorpayPaymentProvider(
      config.razorpayKeyId,
      config.razorpayKeySecret,
      config.razorpayPlanId,
    );

    // Verify webhook signature
    const signature = event.headers['x-razorpay-signature'] ?? '';
    if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) {
      console.error('[paymentWebhook] Invalid signature');
      try { await metricsPort.publishMetric('InvalidPaymentSignature', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
      return { statusCode: 400, body: 'Invalid signature' };
    }

    const payload: RazorpayWebhookPayload = JSON.parse(rawBody);
    console.log('[paymentWebhook] event:', payload.event);

    // We care about subscription.activated and payment.captured events
    if (payload.event !== 'subscription.activated' && payload.event !== 'payment.captured') {
      return { statusCode: 200, body: 'OK' };
    }

    // --- Metrics: SubscriptionActivated / PaymentCaptured ---
    if (payload.event === 'subscription.activated') {
      try { await metricsPort.publishMetric('SubscriptionActivated', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    }
    if (payload.event === 'payment.captured') {
      try { await metricsPort.publishMetric('PaymentCaptured', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    }

    // Extract phone number from notes
    const phoneNumber =
      payload.payload.subscription?.entity.notes?.phone_number ??
      payload.payload.payment?.entity.notes?.phone_number;

    if (!phoneNumber) {
      console.error('[paymentWebhook] No phone number in notes');
      return { statusCode: 200, body: 'OK - no phone' };
    }

    const subscriptionId = payload.payload.subscription?.entity.id;
    const currentEnd = payload.payload.subscription?.entity.current_end;

    // Load user state and update subscription
    const userStateRepo = new DynamoDBUserStateRepository(config.dynamodbTable);
    const userState = await userStateRepo.getUser(phoneNumber);

    if (!userState) {
      console.error('[paymentWebhook] User not found:', phoneNumber);
      return { statusCode: 200, body: 'OK - no user' };
    }

    // Update subscription status
    const updatedSubscription: UserState['subscription'] = {
      ...userState.subscription,
      status: 'active',
      razorpaySubscriptionId: subscriptionId ?? userState.subscription?.razorpaySubscriptionId,
      razorpayPaymentId: payload.payload.payment?.entity.id,
      currentPeriodEnd: currentEnd ? new Date(currentEnd * 1000).toISOString() : undefined,
    };

    // If user is awaiting payment, trigger plan generation
    if (userState.conversationState === 'awaiting_payment') {
      const mealRepo = new JsonMealRepository();
      const mealComponentRepo = new JsonMealComponentRepository();
      const rulesRepo = new JsonRulesRepository();
      const messagingProvider = new TwilioMessagingProvider(
        config.twilioAccountSid,
        config.twilioAuthToken,
        config.twilioSenderNumber,
      );

      // Process as if user confirmed payment
      const stateWithSub: UserState = {
        ...userState,
        subscription: updatedSubscription,
      };

      const result = await processIntent(
        { intent: Intent.CHECK_PAYMENT_STATUS },
        stateWithSub,
        mealRepo,
        mealComponentRepo,
        phoneNumber,
        rulesRepo,
        paymentProvider,
      );

      // Save updated state
      await userStateRepo.saveUser(result.updatedState);

      // Send the plan to the user
      const formatted = formatBotResponse(result.response);
      await sendFormattedResponse(messagingProvider, phoneNumber, formatted);
    } else {
      // Just update the subscription status
      const updatedState: UserState = {
        ...userState,
        subscription: updatedSubscription,
      };
      await userStateRepo.saveUser(updatedState);
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('[paymentWebhook] Error:', error);
    try { await metricsPort.publishMetric('PaymentWebhookError', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    return { statusCode: 500, body: 'Internal error' };
  }
}
