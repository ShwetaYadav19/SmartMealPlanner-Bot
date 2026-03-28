#!/usr/bin/env npx tsx
/**
 * Generate candidate weekly plans for review and approval.
 *
 * Usage:
 *   npx tsx scripts/generate-weekly-plans.ts                          # all combos
 *   npx tsx scripts/generate-weekly-plans.ts --combo north_indian-veg-health
 *   npx tsx scripts/generate-weekly-plans.ts --combo north_indian-veg-health --count 3
 *   npx tsx scripts/generate-weekly-plans.ts --format home_meal --dinner-format quick_meal
 *
 * Output: data/candidate-plans/{combo}/{planId}.json (lightweight, no ingredients)
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonMealRepository } from '../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../src/adapters/jsonMealComponentRepository';
import { generateCandidateDishes, buildPlanFromComponents, type DishPreviewDeps } from '../src/core/dishPreview';
import type { WeeklyPlan, MealFormat, ComposedMeal } from '../src/core/types';

const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_DIR = path.join(DATA_DIR, 'candidate-plans');
const CUISINES = ['north_indian', 'south_indian', 'both'] as const;
const DIETS = ['veg', 'non_veg'] as const;
const STYLES = ['health', 'regular'] as const;

const mealRepo = new JsonMealRepository(path.join(DATA_DIR, 'meals.json'));
const componentRepo = new JsonMealComponentRepository(path.join(DATA_DIR, 'meal-components'));

// Lightweight day plan — just names, no IDs or ingredients
interface LightDayPlan {
  day: string;
  breakfast: string;
  lunch: string;
  dinner: string;
}

interface StoredPlan {
  planId: string;
  combo: string;
  lunchFormat: string;
  dinnerFormat: string;
  status: 'candidate' | 'approved' | 'archived';
  createdAt: string;
  days: LightDayPlan[];
}

function toLightPlan(plan: WeeklyPlan): LightDayPlan[] {
  return plan.map(day => ({
    day: day.day,
    breakfast: day.breakfast.name,
    lunch: day.lunch.name,
    dinner: day.dinner.name,
  }));
}

async function generatePlansForCombo(
  cuisine: string, diet: string, style: string,
  count: number, lunchFormat: MealFormat, dinnerFormat: MealFormat,
): Promise<void> {
  const combo = `${cuisine}-${diet}-${style}`;
  const comboDir = path.join(OUTPUT_DIR, combo);
  if (!fs.existsSync(comboDir)) fs.mkdirSync(comboDir, { recursive: true });

  const deps: DishPreviewDeps = { mealRepository: mealRepo, mealComponentRepository: componentRepo };

  console.log(`\n📋 ${combo} (lunch: ${lunchFormat}, dinner: ${dinnerFormat})`);

  for (let i = 0; i < count; i++) {
    try {
      const candidates = await generateCandidateDishes(deps, { cuisine, diet, style }, []);
      const plan = buildPlanFromComponents(candidates, { cuisine, diet, lunchFormat, dinnerFormat });
      const planId = `${combo}-${lunchFormat}-${dinnerFormat}-${String(i + 1).padStart(2, '0')}`;

      const stored: StoredPlan = {
        planId, combo, lunchFormat, dinnerFormat,
        status: 'candidate',
        createdAt: new Date().toISOString().split('T')[0],
        days: toLightPlan(plan),
      };

      const filePath = path.join(comboDir, `${planId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(stored, null, 2) + '\n');

      // Print readable summary
      console.log(`\n  --- Plan ${i + 1} ---`);
      for (const d of stored.days) {
        console.log(`  ${d.day}: ${d.breakfast} | ${d.lunch} | ${d.dinner}`);
      }
      console.log(`  ✅ ${path.relative(process.cwd(), filePath)}`);
    } catch (err) {
      console.error(`  ❌ Plan ${i + 1} failed:`, err);
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let combo: string | undefined;
  let count = 3;
  let lunchFormat: MealFormat = 'home_meal';
  let dinnerFormat: MealFormat = 'quick_meal';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--combo' && args[i + 1]) combo = args[++i];
    else if (args[i] === '--count' && args[i + 1]) count = parseInt(args[++i], 10);
    else if (args[i] === '--format' && args[i + 1]) lunchFormat = args[++i] as MealFormat;
    else if (args[i] === '--dinner-format' && args[i + 1]) dinnerFormat = args[++i] as MealFormat;
  }
  return { combo, count, lunchFormat, dinnerFormat };
}

async function main() {
  const { combo, count, lunchFormat, dinnerFormat } = parseArgs();
  console.log('🍽️  Generating candidate weekly plans...');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (combo) {
    const parts = combo.split('-');
    // Handle cuisine names with underscores: north_indian-veg-health
    const style = parts.pop()!;
    const diet = parts.pop()!;
    const cuisine = parts.join('-');
    await generatePlansForCombo(cuisine, diet, style, count, lunchFormat, dinnerFormat);
  } else {
    for (const c of CUISINES) for (const d of DIETS) for (const s of STYLES)
      await generatePlansForCombo(c, d, s, count, lunchFormat, dinnerFormat);
  }
  console.log(`\n✅ Done! Now run: npx tsx scripts/preview-plans.ts`);
}

main().catch(console.error);
