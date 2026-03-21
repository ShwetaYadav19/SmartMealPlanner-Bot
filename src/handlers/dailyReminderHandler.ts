// DailyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge daily at 8 PM
// Sends tomorrow's meal plan or expired plan prompt to all onboarded users

import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { formatBotResponse } from '../messageFormatter';
import { loadConfig } from '../config';
import { extractTomorrowPlan } from '../core/planGenerator';
import { ResponseType } from '../core/types';
import type { BotResponse } from '../core/types';

// Minimal EventBridge scheduled event type
interface ScheduledEvent {
  source: string;
  'detail-type': string;
  detail: Record<string, unknown>;
}

export async function dailyReminderHandler(_event: ScheduledEvent): Promise<void> {
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
      let response: BotResponse;

      // Check if user has a plan that covers tomorrow
      if (user.weeklyPlan && user.weeklyPlanStartDate) {
        const tomorrowPlan = extractTomorrowPlan(user.weeklyPlan, user.weeklyPlanStartDate);

        if (tomorrowPlan) {
          response = {
            type: ResponseType.DAILY_REMINDER,
            data: { dayPlan: tomorrowPlan },
          };
        } else {
          response = {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
          };
        }
      } else {
        response = {
          type: ResponseType.EXPIRED_PLAN_PROMPT,
        };
      }

      // Format and send
      const formatted = formatBotResponse(response);

      if (formatted.buttons && formatted.buttons.length > 0) {
        // Daily reminders are out-of-session — pre-approved templates have
        // static text that doesn't include the user's actual plan.
        // Send the dynamic plan text as plain text, then buttons as a follow-up.
        // The numbered-text fallback in sendButtonMessage handles out-of-session delivery.
        await messagingProvider.sendButtonMessage(
          user.phoneNumber,
          formatted.text,
          formatted.buttons,
        );
      } else {
        await messagingProvider.sendTextMessage(user.phoneNumber, formatted.text);
      }
    } catch (error) {
      console.error(`Failed to send daily reminder to ${user.phoneNumber}:`, error);
    }
  }
}

export const handler = dailyReminderHandler;
