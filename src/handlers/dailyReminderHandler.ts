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
import { getTemplateSid } from '../messages';

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

      // --- Out-of-session: send pre-approved template first ---
      if (response.type === ResponseType.DAILY_REMINDER && response.data?.dayPlan) {
        const dayPlan = response.data.dayPlan;
        const templateSid = getTemplateSid('daily_reminder');

        // Template body: {{1}} = breakfast, {{2}} = lunch, {{3}} = dinner
        const contentVariables: Record<string, string> = {
          '1': dayPlan.breakfast.name,
          '2': dayPlan.lunch.name,
          '3': dayPlan.dinner.name,
        };

        await messagingProvider.sendTextMessage(
          user.phoneNumber,
          '', // body unused when contentSid is provided
          templateSid,
          contentVariables,
        );

        // Template opens the 24h session window, so follow up with
        // the grocery prompt as an in-session quick-reply message
        await messagingProvider.sendButtonMessage(
          user.phoneNumber,
          'Would you like to see tomorrow\'s grocery list? 🛒',
          [
            { id: 'daily_grocery_yes', title: 'Yes 🛒' },
            { id: 'daily_grocery_no', title: 'No ❌' },
          ],
        );
      } else {
        // Expired plan — use template if available, otherwise freeform
        const expiredSid = getTemplateSid('expired_plan');
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
      }

      // Update conversation state so the next user reply enters the daily flow
      if (response.type === ResponseType.DAILY_REMINDER) {
        await userStateRepo.saveUser({
          ...user,
          conversationState: 'daily_grocery_prompt',
        });
      }
    } catch (error) {
      console.error(`Failed to send daily reminder to ${user.phoneNumber}:`, error);
    }
  }
}

export const handler = dailyReminderHandler;
