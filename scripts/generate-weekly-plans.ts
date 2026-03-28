#!/usr/bin/env npx tsx
/**
 * Generate candidate weekly plans for review and approval.
 *
 * Usage:
 *   npx tsx scripts/generate-weekly-plans.ts                          # generate for all combos
 *   npx tsx scripts/generate-weekly-plans.ts --combo north_indian-veg-health
 *   npx tsx scripts/generate-weekly-plans.ts --combo north_indian-veg-health --count 3
 *   npx tsx scripts/generate-weekly-plans.ts --format home_meal       # lunch format
 *   npx tsx scripts/generate-weekly-plans.ts --dinner-format quick_meal
 *
 * Output goes to data/candidate-plans/{combo}/plan-{N}.json
 * Review, edit, then approve with the approve script.
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonMealRepository } from '../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../src/adapters/jsonMealComponentRepository';
import { generateCandidateDishes, buildPlanFromComponents, type DishPreviewDeps } from '../src/core/dishPreview';
import type { WeeklyPlan, DayPlan, MealFormat, ComposedMeal, Meal } from '../src/core/types';

const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_DIR = path.join(DATA_DIR, 'candidate-plans');

const CUISINES = ['north_indian', 'south_indian', 'both'] as const;
const DIETS = ['veg', 'non_veg'] as const;
const STYLES = ['health', 'regular'] as const;

const mealRepo = new JsonMealRepository(path.join(DATA_DIR, 'meals.json'));
const componentRepo = new JsonMealComponentRepository(path.join(DATA_DIR, 'meal-components'));

// --- Human-readable plan formatting ---

function formatMealName(meal: Meal | ComposedMeal): string {
  return meal.name;
}

function formatDayPlan(day: DayPlan): string {
  return [
    `  🥣 ${day.breakfast.name}`,
    `  🍛 ${day.lunch.name}`,
    `  🍽️ ${day.dinner.name}`,
  ].join('\n');
}

function formatPlanReadable(plan: WeeklyPlan): string {
  return plan.map(day => `${day.day}\n${formatDayPlan(day)}`).join('\n\n');
}

interface StoredPlan {
  planId: string;
  combo: string;
  lunchFormat: string;
  dinnerFormat: string;
  status: 'candidate' | 'approved' | 'archived';
  createdAt: string;
  weeklyPlan: WeeklyPlan;
  readable: string;
}

async function generatePlansForCombo(
  cuisine: string,
  diet: string,
  style: string,
  count: number,
  lunchFormat: MealFormat,
  dinnerFormat: MealFormat,
): Promise<void> {
  const combo = `${cuisine}-${diet}-${style}`;
  const comboDir = path.join(OUTPUT_DIR, combo);

  if (!fs.existsSync(comboDir)) {
    fs.mkdirSync(comboDir, { recursive: true });
  }

  const deps: DishPreviewDeps = { mealRepository: mealRepo, mealComponentRepository: componentRepo };
  const preferences = { cuisine, diet, style };

  console.log(`\n📋 ${combo} (lunch: ${lunchFormat}, dinner: ${dinnerFormat})`);

  for (let i = 0; i < count; i++) {
    try {
      const candidates = await generateCandidateDishes(deps, preferences, []);
      const plan = buildPlanFromComponents(candidates, {
        cuisine,
        diet,
        lunchFormat,
        dinnerFormat,
      });

      const planId = `${combo}-${lunchFormat}-${dinnerFormat}-${String(i + 1).padStart(2, '0')}`;
      const readable = formatPlanReadable(plan);

      const stored: StoredPlan = {
        planId,
        combo,
        lunchFormat,
        dinnerFormat,
        status: 'candidate',
        createdAt: new Date().toISOString().split('T')[0],
        weeklyPlan: plan,
        readable,
      };

      const filePath = path.join(comboDir, `${planId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(stored, null, 2) + '\n');

      console.log(`\n  --- Plan ${i + 1} (${planId}) ---`);
      console.log(readable);
      console.log(`  ✅ Saved to ${path.relative(process.cwd(), filePath)}`);
    } catch (err) {
      console.error(`  ❌ Failed to generate plan ${i + 1}:`, err);
    }
  }
}

// --- CLI argument parsing ---

function parseArgs() {
  const args = process.argv.slice(2);
  let combo: string | undefined;
  let count = 3;
  let lunchFormat: MealFormat = 'home_meal';
  let dinnerFormat: MealFormat = 'quick_meal';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--combo' && args[i + 1]) {
      combo = args[++i];
    } else if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[++i], 10);
    } else if (args[i] === '--format' && args[i + 1]) {
      lunchFormat = args[++i] as MealFormat;
    } else if (args[i] === '--dinner-format' && args[i + 1]) {
      dinnerFormat = args[++i] as MealFormat;
    }
  }

  return { combo, count, lunchFormat, dinnerFormat };
}

async function main() {
  const { combo, count, lunchFormat, dinnerFormat } = parseArgs();

  console.log('🍽️  Generating candidate weekly plans...');
  console.log(`   Count per combo: ${count}`);
  console.log(`   Lunch format: ${lunchFormat}, Dinner format: ${dinnerFormat}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (combo) {
    const [cuisine, diet, style] = combo.split('-');
    if (!cuisine || !diet || !style) {
      console.error('Invalid combo format. Use: cuisine-diet-style (e.g. north_indian-veg-health)');
      process.exit(1);
    }
    await generatePlansForCombo(cuisine, diet, style, count, lunchFormat, dinnerFormat);
  } else {
    for (const cuisine of CUISINES) {
      for (const diet of DIETS) {
        for (const style of STYLES) {
          await generatePlansForCombo(cuisine, diet, style, count, lunchFormat, dinnerFormat);
        }
      }
    }
  }

  console.log(`\n✅ Done! Plans in ${path.relative(process.cwd(), OUTPUT_DIR)}`);
  console.log('\nNext steps:');
  console.log('  1. Review the generated plans in data/candidate-plans/');
  console.log('  2. Edit any plan JSON — change the "readable" field to see your edits');
  console.log('  3. Change "status" from "candidate" to "approved" for plans you like');
  console.log('  4. Approved plans will be served to users\n');
}

main().catch(console.error);
