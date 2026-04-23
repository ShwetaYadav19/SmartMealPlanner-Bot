// WeeklyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge every Sunday at 6 PM IST
// Sends a template nudge to all onboarded users prompting them to generate a new plan.
// The plan itself is NOT sent here — users must explicitly request it via the bot.
// Daily reminders continue using whatever plan the user has (even from last week).

import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { CloudWatchMetricsAdapter } from '../adapters/cloudwatchMetricsAdapter';
import { loadConfig } from '../config';
import { getTemplateSid } from '../messages';

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

  // Support single-user test: if detail.phoneNumber is provided, only process that user
  const targetPhone = (_event.detail as Record<string, unknown>)?.phoneNumber as string | undefined;
  let onboardedUsers;
  if (targetPhone) {
    console.log(`[weeklyReminder] Single-user mode: ${targetPhone}`);
    const user = await userStateRepo.getUser(targetPhone);
    onboardedUsers = user ? [user] : [];
  } else {
    onboardedUsers = await userStateRepo.scanOnboardedUsers();
  }
  console.log(`[weeklyReminder] Found ${onboardedUsers.length} onboarded users`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of onboardedUsers) {
    try {
      const templateSid = getTemplateSid('weekly_reminder');
      console.log(`[weeklyReminder] Processing ${user.phoneNumber} | templateSid=${templateSid ?? 'NONE'}`);

      if (!templateSid) {
        console.error(`[weeklyReminder] No template SID configured for weekly_reminder. Set TWILIO_TEMPLATE_SID_WEEKLY_REMINDER env var. Skipping ${user.phoneNumber}.`);
        skipped++;
        try { await metricsPort.publishMetric('WeeklyReminderFailure', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
        continue;
      }

      // Send the pre-approved template message only.
      // The user decides whether to generate a new plan by replying.
      // Their existing plan (if any) stays intact for daily reminders.
      await messagingProvider.sendTextMessage(
        user.phoneNumber,
        '', // body ignored when contentSid is provided
        templateSid,
      );
      console.log(`[weeklyReminder] Template sent to ${user.phoneNumber}`);

      sent++;
      try { await metricsPort.publishMetric('WeeklyReminderSent', 1, 'Count'); } catch (e) { console.error('[metrics]', e); }
    } catch (error) {
      failed++;
      const errCode = (error as any)?.code ?? (error as any)?.status;
      console.error(`[weeklyReminder] Failed for ${user.phoneNumber}:`, error);
      console.error(JSON.stringify({
        event: 'WEEKLY_REMINDER_FAILED',
        phoneNumber: user.phoneNumber,
        errorCode: errCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      try {
        await metricsPort.publishMetric('WeeklyReminderFailure', 1, 'Count', { ErrorCode: String(errCode ?? 'unknown') });
      } catch (e) { console.error('[metrics]', e); }
    }
  }

  console.log(`[weeklyReminder] Complete | sent=${sent} failed=${failed} skipped=${skipped} total=${onboardedUsers.length}`);
}

export const handler = weeklyReminderHandler;
