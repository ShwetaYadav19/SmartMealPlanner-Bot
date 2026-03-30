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
import { getTemplateSid, DAILY_REMINDER_HEADER } from '../messages';

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

  // Scan all users with onboardingComplete: true
  const onboardedUsers = await userStateRepo.scanOnboardedUsers();
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

      // --- Out-of-session: send pre-approved template first ---
      if (response.type === ResponseType.DAILY_REMINDER && response.data?.dayPlan) {
        const dayPlan = response.data.dayPlan;
        const templateSid = getTemplateSid('daily_reminder');
        console.log(`[dailyReminder] Sending daily template to ${user.phoneNumber} | templateSid=${templateSid ?? 'NONE'}`);

        // Build a freeform fallback body in case the template send fails
        const fallbackBody = `${DAILY_REMINDER_HEADER(dayPlan.day)}\n🥣 Breakfast: ${dayPlan.breakfast.name}\n🍛 Lunch: ${dayPlan.lunch.name}\n🍽️ Dinner: ${dayPlan.dinner.name}\n\nReply SWAP if you'd like a different lunch.`;

        const msgSid = await messagingProvider.sendTextMessage(
          user.phoneNumber,
          fallbackBody,
          templateSid,
        );
        console.log(`[dailyReminder] Template sent to ${user.phoneNumber} | msgSid=${msgSid ?? 'freeform-fallback'}`);

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

      // Update conversation state so the next user reply enters the daily flow
      if (response.type === ResponseType.DAILY_REMINDER) {
        console.log(`[dailyReminder] Updating conversationState to daily_grocery_prompt for ${user.phoneNumber}`);
        await userStateRepo.saveUser({
          ...user,
          conversationState: 'daily_grocery_prompt',
        });
      }
    } catch (error) {
      failed++;
      console.error(`[dailyReminder] Failed for ${user.phoneNumber}:`, error);
      try { await metricsPort.publishMetric('DailyReminderFailure', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    }
  }

  console.log(`[dailyReminder] Complete | sent=${sent} expired=${expired} failed=${failed} total=${onboardedUsers.length}`);
}

export const handler = dailyReminderHandler;
