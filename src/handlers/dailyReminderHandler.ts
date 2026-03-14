// DailyReminderHandler — thin wiring layer (no business logic)
// Triggered by EventBridge daily at 8 PM
// Sends tomorrow's meal plan or expired plan prompt to all onboarded users

import * as path from 'path';
import { DynamoDBUserStateRepository } from '../adapters/dynamodbUserStateRepository';
import { JsonMealRepository } from '../adapters/jsonMealRepository';
import { TwilioMessagingProvider } from '../adapters/twilioMessagingProvider';
import { formatBotResponse } from '../messageFormatter';
import { loadConfig } from '../config';
import { getTemplateSid } from '../messages';
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

  // Scan all users with onboardingComplete: true
  const onboardedUsers = await userStateRepo.scanOnboardedUsers();

  for (const user of onboardedUsers) {
    try {
      let response: BotResponse;

      // Check if user has a plan that covers tomorrow
      if (user.weeklyPlan && user.weeklyPlanStartDate) {
        const tomorrowPlan = extractTomorrowPlan(user.weeklyPlan, user.weeklyPlanStartDate);

        if (tomorrowPlan) {
          // Plan covers tomorrow → send DAILY_REMINDER with dayPlan data
          response = {
            type: ResponseType.DAILY_REMINDER,
            data: { dayPlan: tomorrowPlan },
          };
        } else {
          // Plan doesn't cover tomorrow (expired) → prompt to generate new plan
          response = {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
          };
        }
      } else {
        // No plan at all → prompt to generate new plan
        response = {
          type: ResponseType.EXPIRED_PLAN_PROMPT,
        };
      }

      // Format and send
      const formatted = formatBotResponse(response);

      if (formatted.buttons && formatted.buttons.length > 0) {
        await messagingProvider.sendButtonMessage(
          user.phoneNumber,
          formatted.text,
          formatted.buttons,
          formatted.templatePurpose,
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
