// WeeklyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge every Sunday at 6 PM
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
  console.log('[weeklyReminder] Handler invoked', JSON.stringify({ source: _event.source, detailType: _event['detail-type'] }));
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
  console.log(`[weeklyReminder] Found ${onboardedUsers.length} onboarded users`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of onboardedUsers) {
    try {
      const templateSid = getTemplateSid('weekly_reminder');
      console.log(`[weeklyReminder] Processing ${user.phoneNumber} | hasPlan=${!!user.weeklyPlan} | templateSid=${templateSid ?? 'NONE'}`);

      if (!templateSid) {
        console.error(`[weeklyReminder] No template SID configured for weekly_reminder. Set TWILIO_TEMPLATE_SID_WEEKLY_REMINDER env var. Skipping ${user.phoneNumber}.`);
        skipped++;
        try { await metricsPort.publishMetric('WeeklyReminderFailure', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
        continue;
      }

      // Step 1: Send the pre-approved template to open a WhatsApp session.
      console.log(`[weeklyReminder] Sending template message to ${user.phoneNumber}`);
      await messagingProvider.sendTextMessage(
        user.phoneNumber,
        '', // body ignored when contentSid is provided
        templateSid,
      );
      console.log(`[weeklyReminder] Template sent to ${user.phoneNumber}`);

      // Step 2: Now that the session is open, send plan details as freeform messages.
      if (user.weeklyPlan) {
        console.log(`[weeklyReminder] Sending existing plan to ${user.phoneNumber}`);
        const response: BotResponse = {
          type: ResponseType.WEEKLY_REMINDER,
          data: { weeklyPlan: user.weeklyPlan },
        };
        const formatted = formatBotResponse(response);

        // Send the plan text combined with the first follow-up (approval CTA)
        // to reduce the number of separate messages the user receives.
        const firstFollowUp = formatted.followUp?.[0];
        if (firstFollowUp?.buttons && firstFollowUp.buttons.length > 0) {
          // Merge plan text + approval prompt into a single button message
          const combinedText = `${formatted.text}\n\n${firstFollowUp.text}`;
          await messagingProvider.sendButtonMessage(
            user.phoneNumber,
            combinedText,
            firstFollowUp.buttons,
          );
        } else if (formatted.buttons && formatted.buttons.length > 0) {
          await messagingProvider.sendButtonMessage(
            user.phoneNumber,
            formatted.text,
            formatted.buttons,
          );
        } else {
          await messagingProvider.sendTextMessage(user.phoneNumber, formatted.text);
        }
        console.log(`[weeklyReminder] Plan text sent to ${user.phoneNumber}`);

        // Send any remaining follow-ups beyond the first (which was already merged)
        if (formatted.followUp && formatted.followUp.length > 1) {
          const remaining = formatted.followUp.slice(1);
          console.log(`[weeklyReminder] Sending ${remaining.length} additional follow-up message(s) to ${user.phoneNumber}`);
          for (const followUpMsg of remaining) {
            if (followUpMsg.buttons && followUpMsg.buttons.length > 0) {
              await messagingProvider.sendButtonMessage(
                user.phoneNumber,
                followUpMsg.text,
                followUpMsg.buttons,
              );
            } else {
              await messagingProvider.sendTextMessage(user.phoneNumber, followUpMsg.text);
            }
          }
        }

        // Send plan image (no separate caption — template already greeted the user)
        try {
          console.log(`[weeklyReminder] Sending plan image to ${user.phoneNumber}`);
          await sendWeeklyPlanImage(messagingProvider, user.phoneNumber, user.weeklyPlan);
          console.log(`[weeklyReminder] Plan image sent to ${user.phoneNumber}`);
        } catch (imgErr) {
          console.error(`[weeklyReminder] Image failed for ${user.phoneNumber}:`, imgErr);
        }
        const newStartDate = getCurrentWeekMondayISO();
        console.log(`[weeklyReminder] Resetting weeklyPlanStartDate to ${newStartDate} for ${user.phoneNumber}`);
        await userStateRepo.saveUser({
          ...user,
          weeklyPlanStartDate: newStartDate,
          conversationState: 'main_menu',
        });
      }

      sent++;
      try { await metricsPort.publishMetric('WeeklyReminderSent', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    } catch (error) {
      failed++;
      console.error(`[weeklyReminder] Failed for ${user.phoneNumber}:`, error);
      try { await metricsPort.publishMetric('WeeklyReminderFailure', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    }
  }

  console.log(`[weeklyReminder] Complete | sent=${sent} failed=${failed} skipped=${skipped} total=${onboardedUsers.length}`);
}

export const handler = weeklyReminderHandler;
