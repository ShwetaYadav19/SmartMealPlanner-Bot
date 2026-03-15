// WeeklyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge every Sunday at 8 PM
// Sends a weekly reminder to all onboarded users prompting them to generate a new plan

import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { formatBotResponse } from '../messageFormatter';
import { loadConfig } from '../config';
import { getTemplateSid } from '../messages';
import { ResponseType } from '../core/types';
import type { BotResponse } from '../core/types';

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

  // Scan all users with onboardingComplete: true
  const onboardedUsers = await userStateRepo.scanOnboardedUsers();

  for (const user of onboardedUsers) {
    try {
      const response: BotResponse = {
        type: ResponseType.WEEKLY_REMINDER,
      };

      // Format and send
      const formatted = formatBotResponse(response);

      if (formatted.buttons && formatted.buttons.length > 0) {
        // Out-of-session: use pre-approved template SID for weekly reminder
        const contentSid = getTemplateSid('weekly_reminder');

        await messagingProvider.sendButtonMessage(
          user.phoneNumber,
          formatted.text,
          formatted.buttons,
          contentSid,
        );
      } else {
        await messagingProvider.sendTextMessage(user.phoneNumber, formatted.text);
      }
    } catch (error) {
      console.error(`Failed to send weekly reminder to ${user.phoneNumber}:`, error);
    }
  }
}

export const handler = weeklyReminderHandler;
