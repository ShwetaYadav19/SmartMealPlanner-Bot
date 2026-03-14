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
import { formatBotResponse, formatCookMessage } from '../src/messageFormatter';
import { JsonMealRepository } from '../src/adapters/jsonMealRepository';
import { UserState, ResponseType } from '../src/core/types';

// Known button IDs — if the user types one of these, treat it as a button tap
const BUTTON_IDS = new Set([
  'north_indian', 'south_indian', 'both',
  'veg', 'non_veg',
  'health', 'regular',
  'weekly_plan', 'weekly_grocery',
  'tomorrow_plan', 'tomorrow_grocery',
  'send_to_cook', 'swap_lunch', 'save_cook',
]);

const PHONE = '+919876543210';
const mealRepo = new JsonMealRepository(path.join(__dirname, '../data/meals.json'));

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

  // Determine if this is a button tap or free text
  const isButton = BUTTON_IDS.has(trimmed);
  const buttonPayload = isButton ? trimmed : undefined;
  const body = isButton ? '' : trimmed;
  const convState = userState?.conversationState ?? 'awaiting_cuisine';

  // 1. Intent mapping (same as webhook handler)
  const intent = mapWhatsAppToIntent(buttonPayload, body, convState);

  // 2. Process through BotEngine
  const result = await processIntent(intent, userState, mealRepo);

  // 3. Format for WhatsApp display
  const formatted = formatBotResponse(result.response);

  // 4. Print the bot's response
  console.log('\n' + '─'.repeat(50));
  console.log('🤖 Bot:');
  console.log(formatted.text);

  if (formatted.buttons && formatted.buttons.length > 0) {
    console.log('\n📱 Buttons:');
    for (const btn of formatted.buttons) {
      console.log(`  [${btn.id}] ${btn.title}`);
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

  // 6. Update state
  userState = result.updatedState;
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
