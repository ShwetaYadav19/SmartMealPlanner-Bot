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
import { JsonMealComponentRepository } from '../src/adapters/jsonMealComponentRepository';
import { UserState, ResponseType } from '../src/core/types';

// Known button IDs — if the user types one of these, treat it as a button tap
const BUTTON_IDS = new Set([
  'north_indian', 'south_indian', 'both',
  'veg', 'non_veg',
  'health', 'regular',
  'weekly_plan', 'weekly_grocery',
  'tomorrow_plan', 'tomorrow_grocery',
  'send_to_cook', 'swap_lunch', 'save_cook',
  'skip_cook', 'confirm_dishes', 'more_options',
  'change_preference', 'change_cook_number',
  'next_category',
]);

const PHONE = '+919876543210';
const mealRepo = new JsonMealRepository(path.join(__dirname, '../data/meals.json'));
const mealComponentRepo = new JsonMealComponentRepository(path.join(__dirname, '../data/meal-components.json'));

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
  const isButton = BUTTON_IDS.has(trimmed) || trimmed.startsWith('remove_dish_');
  let buttonPayload = isButton ? trimmed : undefined;
  const body = isButton ? '' : trimmed;
  const convState = userState?.conversationState ?? 'awaiting_cuisine';

  // Resolve numbered input: if user typed a number and we have stored button IDs,
  // map the number to the corresponding button payload (handles >3 button fallback)
  // Also supports multi-select: "1,3" or "1 3" resolves to multiple IDs joined by commas
  if (!buttonPayload && userState?.lastButtonIds?.length) {
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= userState.lastButtonIds.length && String(num) === trimmed) {
      buttonPayload = userState.lastButtonIds[num - 1];
    } else {
      // Try multi-select: split by comma, space, or both
      const parts = trimmed.split(/[\s,]+/).filter(p => p.length > 0);
      if (parts.length > 1) {
        const resolvedIds: string[] = [];
        let valid = true;
        for (const part of parts) {
          const n = parseInt(part, 10);
          if (isNaN(n) || n < 1 || n > userState.lastButtonIds.length || String(n) !== part) {
            valid = false;
            break;
          }
          resolvedIds.push(userState.lastButtonIds[n - 1]);
        }
        if (valid) {
          const unique = [...new Set(resolvedIds)];
          buttonPayload = unique.length > 1 ? unique.join(',') : unique[0];
        }
      }
    }
  }

  // Also resolve bare IDs: if user typed something like "si-base-001",
  // check if "remove_dish_{input}" matches a stored button ID
  if (!buttonPayload && userState?.lastButtonIds?.length) {
    const asRemove = `remove_dish_${trimmed}`;
    if (userState.lastButtonIds.includes(asRemove)) {
      buttonPayload = asRemove;
    } else if (userState.lastButtonIds.includes(trimmed)) {
      buttonPayload = trimmed;
    }
  }

  // 1. Intent mapping (same as webhook handler)
  const intent = mapWhatsAppToIntent(buttonPayload, body, convState);

  // 2. Process through BotEngine
  const result = await processIntent(intent, userState, mealRepo, mealComponentRepo);

  // 3. Format for WhatsApp display
  const formatted = formatBotResponse(result.response);

  // 4. Print the bot's response
  console.log('\n' + '─'.repeat(50));
  console.log('🤖 Bot:');
  console.log(formatted.text);

  let numberOffset = 0;
  if (formatted.listItems && formatted.listItems.length > 0) {
    console.log(`\n📋 [${formatted.listButtonLabel ?? 'Select'}]:`);
    for (let i = 0; i < formatted.listItems.length; i++) {
      const li = formatted.listItems[i];
      console.log(`  ${i + 1}. [${li.id}] ${li.item}`);
    }
    numberOffset = formatted.listItems.length;
  }

  if (formatted.buttons && formatted.buttons.length > 0) {
    console.log('\n📱 Buttons:');
    for (let i = 0; i < formatted.buttons.length; i++) {
      const btn = formatted.buttons[i];
      console.log(`  ${numberOffset + i + 1}. [${btn.id}] ${btn.title}`);
    }
  }

  if ((formatted.listItems && formatted.listItems.length > 0) || (formatted.buttons && formatted.buttons.length > 0)) {
    console.log('\n💡 Type a number or the button/item ID to select.');
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

  // 6. Update state and store button IDs for numbered input resolution
  userState = result.updatedState;
  const allIds: string[] = [];
  if (formatted.listItems && formatted.listItems.length > 0) {
    allIds.push(...formatted.listItems.map(li => li.id));
  }
  if (formatted.buttons && formatted.buttons.length > 0) {
    allIds.push(...formatted.buttons.map(b => b.id));
  }
  userState.lastButtonIds = allIds.length > 0 ? allIds : undefined;
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
