// WeeklyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge every Sunday at 8 PM
// Sends a weekly reminder to all onboarded users prompting them to generate a new plan

import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { CloudWatchMetricsAdapter } from '../adapters/cloudwatchMetricsAdapter';
import { formatBotResponse } from '../messageFormatter';
import { loadConfig } from '../config';
import { ResponseType } from '../core/types';
import type { BotResponse } from '../core/types';
import { getCurrentWeekMondayISO } from '../core/botEngine';
import { getTemplateSid } from '../messages';
import { sendWeeklyPlanImage } from '../core/imageSender';

// Minimal EventBridge scheduled event type
interface ScheduledEvent {
  source: string;
  'detail-type': string;
  detail: Record<string, unknown>;
}

export async function weeklyReminderHandler(_event: ScheduledEvent): Promise<void> {
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

  for (const user of onboardedUsers) {
    try {
      let response: BotResponse;

      if (user.weeklyPlan) {
        // Show existing plan with grocery/change options
        response = {
          type: ResponseType.WEEKLY_REMINDER,
          data: { weeklyPlan: user.weeklyPlan },
        };
      } else {
        // No plan — prompt to generate
        response = {
          type: ResponseType.WEEKLY_REMINDER,
        };
      }

      // Format and send using pre-approved template (out-of-session)
      const formatted = formatBotResponse(response);
      const templateSid = getTemplateSid('weekly_reminder');

      if (formatted.buttons && formatted.buttons.length > 0) {
        await messagingProvider.sendButtonMessage(
          user.phoneNumber,
          formatted.text,
          formatted.buttons,
          templateSid,
        );
      } else {
        await messagingProvider.sendTextMessage(
          user.phoneNumber,
          formatted.text,
          templateSid,
        );
      }

      // Send follow-up messages (e.g. grocery/change buttons after plan text)
      if (formatted.followUp) {
        for (const followUpMsg of formatted.followUp) {
          if (followUpMsg.buttons && followUpMsg.buttons.length > 0) {
            await messagingProvider.sendButtonMessage(
              user.phoneNumber,
              followUpMsg.text,
              followUpMsg.buttons,
              templateSid,
            );
          } else {
            await messagingProvider.sendTextMessage(
              user.phoneNumber,
              followUpMsg.text,
              templateSid,
            );
          }
        }
      }

      // Reset weeklyPlanStartDate to the new week so daily reminders work correctly
      if (user.weeklyPlan) {
        try {
          await sendWeeklyPlanImage(messagingProvider, user.phoneNumber, user.weeklyPlan);
        } catch (imgErr) {
          console.error(`[weeklyReminder] Image failed for ${user.phoneNumber}:`, imgErr);
        }
        await userStateRepo.saveUser({
          ...user,
          weeklyPlanStartDate: getCurrentWeekMondayISO(),
          conversationState: 'main_menu',
        });
      }

      try { await metricsPort.publishMetric('WeeklyReminderSent', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    } catch (error) {
      console.error(`Failed to send weekly reminder to ${user.phoneNumber}:`, error);
      try { await metricsPort.publishMetric('WeeklyReminderFailure', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    }
  }
}

export const handler = weeklyReminderHandler;
