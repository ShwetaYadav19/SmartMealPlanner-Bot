#!/usr/bin/env npx tsx
/**
 * Interactive local chat simulator for SmartMealPlanner-Bot.
 *
 * Runs the exact same pipeline as a real WhatsApp message:
 *   your input → IntentMapper → BotEngine → MessageFormatter → printed output
 *
 * Usage:
 *   npx tsx scripts/chat.ts
 *
 * How it works:
 *   - Button taps: type the button id exactly (e.g. "north_indian", "weekly_plan", "veg")
 *   - Free text:   just type anything (e.g. a phone number like "+919876543210")
 *   - Type "reset" to start over as a new user
 *   - Type "state" to inspect current user state
 *   - Type "exit" or Ctrl+C to quit
 */

import * as readline from 'readline';
import * as path from 'path';
import { mapWhatsAppToIntent } from '../src/intentMapper';
import { processIntent } from '../src/core/botEngine';
import { formatBotResponse, formatCookMessage, type FormattedMessage } from '../src/messageFormatter';
import { resolveNumberedInput } from '../src/handlers/webhookHandler';
import { JsonMealRepository } from '../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../src/adapters/jsonMealComponentRepository';
import { JsonRulesRepository } from '../src/adapters/jsonRulesRepository';
import { UserState, ResponseType } from '../src/core/types';
import type { PaymentProvider } from '../src/core/ports';

// Mock payment provider for local testing — auto-approves all payments
class MockPaymentProvider implements PaymentProvider {
  async createSubscription(phoneNumber: string) {
    return {
      subscriptionId: `mock_sub_${Date.now()}`,
      paymentLink: 'https://rzp.io/mock-payment-link',
    };
  }
  async getSubscriptionStatus(_subscriptionId: string) {
    // Always return active — simulates successful payment
    return {
      status: 'active' as const,
      paymentId: `mock_pay_${Date.now()}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  verifyWebhookSignature() { return true; }
}

const mockPaymentProvider = new MockPaymentProvider();

// Known button IDs — if the user types one of these, treat it as a button tap
const BUTTON_IDS = new Set([
  'north_indian', 'south_indian', 'both',
  'veg', 'non_veg', 'veg_with_eggs',
  'health', 'regular',
  'weekly_plan', 'weekly_grocery',
  'tomorrow_plan', 'tomorrow_grocery',
  'send_to_cook', 'swap_lunch', 'save_cook',
  'skip_cook', 'confirm_dishes',
  'change_preference', 'change_cook_number',
  'next_category',
  'check_payment',
  // Change Plan flow
  'change_plan', 'few_meals', 'entire_plan',
  'accept_plan', 'retry_plan', 'change_more', 'done_changing',
  // Day selection
  'day_0', 'day_1', 'day_2', 'day_3', 'day_4', 'day_5', 'day_6',
  // Slot selection
  'slot_breakfast', 'slot_lunch', 'slot_dinner',
  // Alternative selection
  'alt_0', 'alt_1', 'alt_2',
]);

const PHONE = '+919876543210';
const mealRepo = new JsonMealRepository(path.join(__dirname, '../data/meals.json'));
const mealComponentRepo = new JsonMealComponentRepository(path.join(__dirname, '../data/meal-components'));
const rulesRepo = new JsonRulesRepository(path.join(__dirname, '../data/meal-selection-rules.json'));

let userState: UserState | null = null;

async function handleInput(input: string): Promise<void> {
  const trimmed = input.trim();
  if (!trimmed) return;

  if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
    console.log('\nBye! 👋');
    process.exit(0);
  }

  if (trimmed.toLowerCase() === 'reset') {
    userState = null;
    console.log('\n🔄 State reset — you are a new user now.\n');
    return;
  }

  if (trimmed.toLowerCase() === 'state') {
    console.log('\n📋 Current user state:');
    console.log(JSON.stringify(userState, null, 2));
    console.log();
    return;
  }

  // Determine if this is a button tap or free text (same as webhook handler)
  const isButton = BUTTON_IDS.has(trimmed) || trimmed.startsWith('remove_dish_');
  const buttonPayload = isButton ? trimmed : undefined;
  const body = isButton ? '' : trimmed;
  const convState = userState?.conversationState ?? 'awaiting_cuisine';

  // Use the same resolveNumberedInput as the webhook handler
  const resolvedPayload = resolveNumberedInput(buttonPayload, body, userState?.lastButtonIds);

  // 1. Intent mapping (same as webhook handler)
  const intent = mapWhatsAppToIntent(resolvedPayload, body, convState);

  // 2. Process through BotEngine (pass PHONE just like webhook passes phoneNumber)
  const result = await processIntent(intent, userState, mealRepo, mealComponentRepo, PHONE, rulesRepo, mockPaymentProvider);

  // 3. Format for WhatsApp display
  const formatted = formatBotResponse(result.response);

  // 4. Print the bot's response (primary + follow-ups, matching webhook send order)
  const allMessages = [formatted, ...(formatted.followUp ?? [])];
  printFormattedMessage(formatted);
  if (formatted.followUp) {
    for (const followUpMsg of formatted.followUp) {
      printFormattedMessage(followUpMsg);
    }
  }

  // 5. If cook message was sent, show what the cook would receive
  if (
    result.response.type === ResponseType.COOK_MESSAGE_SENT &&
    result.response.data?.dayPlan &&
    result.response.data?.cookNumber
  ) {
    console.log(`\n📨 Message sent to cook (${result.response.data.cookNumber}):`);
    console.log(formatCookMessage(result.response.data.dayPlan));
  }

  console.log('─'.repeat(50));

  // 6. Update state and store button IDs from ALL messages (same as webhook handler)
  userState = result.updatedState;
  const allIds: string[] = [];
  for (const msg of allMessages) {
    if (msg.listItems && msg.listItems.length > 0) {
      allIds.push(...msg.listItems.map(li => li.id));
    }
    if (msg.buttons && msg.buttons.length > 0) {
      allIds.push(...msg.buttons.map(b => b.id));
    }
  }
  userState.lastButtonIds = allIds.length > 0 ? allIds : undefined;
}

/** Print a single FormattedMessage to the console */
function printFormattedMessage(msg: FormattedMessage): void {
  console.log('\n' + '─'.repeat(50));
  console.log('🤖 Bot:');
  console.log(msg.text);

  let numberOffset = 0;
  if (msg.listItems && msg.listItems.length > 0) {
    console.log(`\n📋 [${msg.listButtonLabel ?? 'Select'}]:`);
    for (let i = 0; i < msg.listItems.length; i++) {
      const li = msg.listItems[i];
      console.log(`  ${i + 1}. [${li.id}] ${li.item}`);
    }
    numberOffset = msg.listItems.length;
  }

  if (msg.buttons && msg.buttons.length > 0) {
    console.log('\n📱 Buttons:');
    for (let i = 0; i < msg.buttons.length; i++) {
      const btn = msg.buttons[i];
      console.log(`  ${numberOffset + i + 1}. [${btn.id}] ${btn.title}`);
    }
  }

  if ((msg.listItems && msg.listItems.length > 0) || (msg.buttons && msg.buttons.length > 0)) {
    console.log('\n💡 Type a number or the button/item ID to select.');
  }
}

// --- REPL ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('╔══════════════════════════════════════════════════╗');
console.log('║   SmartMealPlanner-Bot — Local Chat Simulator   ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  Type button IDs or free text, just like a      ║');
console.log('║  WhatsApp user would.                           ║');
console.log('║                                                 ║');
console.log('║  Commands: reset | state | exit                 ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log();

// Kick off with the initial greeting (new user)
handleInput('hi').then(() => prompt());

function prompt() {
  rl.question('You: ', async (input) => {
    try {
      await handleInput(input);
    } catch (err) {
      console.error('Error:', err);
    }
    prompt();
  });
}
