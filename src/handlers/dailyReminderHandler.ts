// DailyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge daily at 8 PM
// Sends tomorrow's meal plan or expired plan prompt to all onboarded users

import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { CloudWatchMetricsAdapter } from '../adapters/cloudwatchMetricsAdapter';
import { formatBotResponse } from '../messageFormatter';
import { loadConfig } from '../config';
import { extractTomorrowPlan } from '../core/planGenerator';
import { ResponseType } from '../core/types';
import type { BotResponse } from '../core/types';
import { getTemplateSid } from '../messages';

// Minimal EventBridge scheduled event type
interface ScheduledEvent {
  source: string;
  'detail-type': string;
  detail: Record<string, unknown>;
}

export async function dailyReminderHandler(_event: ScheduledEvent): Promise<void> {
  console.log('[dailyReminder] Handler invoked', JSON.stringify({ source: _event.source, detailType: _event['detail-type'] }));
  const config = loadConfig();

  const userStateRepo = new DynamoDBUserStateRepository(config.dynamodbTable);
  const messagingProvider = new TwilioMessagingProvider(
    config.twilioAccountSid,
    config.twilioAuthToken,
    config.twilioSenderNumber,
  );
  const metricsPort = new CloudWatchMetricsAdapter();

  // Support single-user test: if detail.phoneNumber is provided, only process that user
  const targetPhone = (_event.detail as Record<string, unknown>)?.phoneNumber as string | undefined;
  let onboardedUsers;
  if (targetPhone) {
    console.log(`[dailyReminder] Single-user mode: ${targetPhone}`);
    const user = await userStateRepo.getUser(targetPhone);
    onboardedUsers = user ? [user] : [];
  } else {
    onboardedUsers = await userStateRepo.scanOnboardedUsers();
  }
  console.log(`[dailyReminder] Found ${onboardedUsers.length} onboarded users`);

  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const user of onboardedUsers) {
    try {
      let response: BotResponse;

      // Check if user has a plan that covers tomorrow
      if (user.weeklyPlan && user.weeklyPlanStartDate) {
        const tomorrowPlan = extractTomorrowPlan(user.weeklyPlan, user.weeklyPlanStartDate);

        if (tomorrowPlan) {
          console.log(`[dailyReminder] ${user.phoneNumber} | hasPlan=true | tomorrowDay=${tomorrowPlan.day}`);
          response = {
            type: ResponseType.DAILY_REMINDER,
            data: { dayPlan: tomorrowPlan },
          };
        } else {
          console.log(`[dailyReminder] ${user.phoneNumber} | hasPlan=true | planExpired (startDate=${user.weeklyPlanStartDate})`);
          response = {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
          };
        }
      } else {
        console.log(`[dailyReminder] ${user.phoneNumber} | hasPlan=false`);
        response = {
          type: ResponseType.EXPIRED_PLAN_PROMPT,
        };
      }

      // --- Out-of-session: send teaser template (no variables) ---
      // Instead of sending the full meal plan, send a lightweight teaser
      // that prompts the user to tap "Yes" to view it. This:
      // 1. Opens the 24h session window so the full plan can be sent freeform
      // 2. Improves engagement metrics with Meta (protects quality rating)
      // 3. Avoids template variable issues with long meal names
      if (response.type === ResponseType.DAILY_REMINDER) {
        const teaserSid = getTemplateSid('daily_teaser');
        const fallbackSid = getTemplateSid('expired_plan');
        console.log(`[dailyReminder] Sending teaser to ${user.phoneNumber} | teaserSid=${teaserSid ?? 'NONE'}`);

        // Send the teaser template — no variables needed
        await messagingProvider.sendTextMessage(
          user.phoneNumber,
          'Hey! 👋 Your meal plan for tomorrow is ready 🍽️\nWould you like to see it?',
          teaserSid,
          undefined,
          fallbackSid,
        );
        console.log(`[dailyReminder] Teaser sent to ${user.phoneNumber}`);

        sent++;
        try { await metricsPort.publishMetric('DailyReminderSent', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
      } else {
        // Expired plan — use template if available, otherwise freeform
        const expiredSid = getTemplateSid('expired_plan');
        console.log(`[dailyReminder] Sending expired plan prompt to ${user.phoneNumber} | expiredTemplateSid=${expiredSid ?? 'NONE'}`);
        const formatted = formatBotResponse(response);

        if (formatted.buttons && formatted.buttons.length > 0) {
          await messagingProvider.sendButtonMessage(
            user.phoneNumber,
            formatted.text,
            formatted.buttons,
            expiredSid,
          );
        } else {
          await messagingProvider.sendTextMessage(
            user.phoneNumber,
            formatted.text,
            expiredSid,
          );
        }

        expired++;
        try { await metricsPort.publishMetric('ExpiredPlanPromptSent', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
      }

      // Update conversation state so the next user reply enters the teaser flow
      if (response.type === ResponseType.DAILY_REMINDER) {
        console.log(`[dailyReminder] Updating conversationState to daily_teaser_prompt for ${user.phoneNumber}`);
        await userStateRepo.saveUser({
          ...user,
          conversationState: 'daily_teaser_prompt',
        });
      }
    } catch (error) {
      failed++;
      const errCode = (error as any)?.code ?? (error as any)?.status;
      console.error(`[dailyReminder] Failed for ${user.phoneNumber}:`, error);
      console.error(JSON.stringify({
        event: 'DAILY_REMINDER_FAILED',
        phoneNumber: user.phoneNumber,
        errorCode: errCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      try {
        await metricsPort.publishMetric('DailyReminderFailure', 1, 'Count', { ErrorCode: String(errCode ?? 'unknown') });
      } catch (e) { console.error('[metrics]', e); }
    }
  }

  console.log(`[dailyReminder] Complete | sent=${sent} expired=${expired} failed=${failed} total=${onboardedUsers.length}`);
}

export const handler = dailyReminderHandler;
