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
import { sendMealVoiceNote } from '../core/voiceNoteSender';

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

      // --- Out-of-session: send pre-approved template first ---
      if (response.type === ResponseType.DAILY_REMINDER && response.data?.dayPlan) {
        const dayPlan = response.data.dayPlan;
        const templateSid = getTemplateSid('daily_reminder');
        console.log(`[dailyReminder] Sending daily template to ${user.phoneNumber} | templateSid=${templateSid ?? 'NONE'}`);

        // Template body: {{1}} = breakfast, {{2}} = lunch, {{3}} = dinner
        // Sanitize: strip newlines and truncate to avoid Twilio variable limits
        const sanitize = (s: string, max = 60) => {
          // Strip newlines, control chars, and problematic unicode that can break Twilio JSON parsing
          const clean = s.replace(/[\n\r\t]/g, ' ').replace(/[\\"""]/g, "'").replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
          return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
        };
        const contentVariables: Record<string, string> = {
          '1': sanitize(dayPlan.breakfast.name),
          '2': sanitize(dayPlan.lunch.name),
          '3': sanitize(dayPlan.dinner.name),
        };
        console.log(`[dailyReminder] contentVariables:`, JSON.stringify(contentVariables));

        // Build a freeform fallback body in case the template send fails
        const fallbackBody = `${DAILY_REMINDER_HEADER(dayPlan.day)}\n🥣 Breakfast: ${dayPlan.breakfast.name}\n🍛 Lunch: ${dayPlan.lunch.name}\n🍽️ Dinner: ${dayPlan.dinner.name}\n\nReply SWAP if you'd like a different lunch.`;

        // Use expired_plan template as fallback — it has no variables and just nudges the user to reply
        const fallbackSid = getTemplateSid('expired_plan');

        await messagingProvider.sendButtonMessage(
          user.phoneNumber,
          fallbackBody,
          [
            { id: 'daily_grocery_yes', title: 'Yes 🛒' },
            { id: 'daily_grocery_no', title: 'No ❌' },
          ],
          templateSid,
          undefined,
          contentVariables,
          fallbackSid,
        );
        console.log(`[dailyReminder] Template sent to ${user.phoneNumber}`);

        // Send Hindi voice note after the text message (best-effort)
        try {
          await sendMealVoiceNote(messagingProvider, user.phoneNumber, dayPlan);
          console.log(`[dailyReminder] Voice note sent to ${user.phoneNumber}`);
        } catch (voiceErr) {
          console.warn(`[dailyReminder] Voice note failed for ${user.phoneNumber}:`, voiceErr);
          // Don't fail the entire reminder if voice note fails
        }

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
