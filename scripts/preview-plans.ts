#!/usr/bin/env npx tsx
/**
 * Generate a readable markdown preview of candidate plans.
 *
 * Usage:
 *   npx tsx scripts/preview-plans.ts --combo north_indian-veg-health --count 3
 *   npx tsx scripts/preview-plans.ts  # all combos, 2 plans each
 *
 * Opens/creates: data/candidate-plans/PREVIEW.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonMealRepository } from '../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../src/adapters/jsonMealComponentRepository';
import { generateCandidateDishes, buildPlanFromComponents, type DishPreviewDeps } from '../src/core/dishPreview';
import type { WeeklyPlan, DayPlan, MealFormat } from '../src/core/types';

const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_DIR = path.join(DATA_DIR, 'candidate-plans');

const mealRepo = new JsonMealRepository(path.join(DATA_DIR, 'meals.json'));
const componentRepo = new JsonMealComponentRepository(path.join(DATA_DIR, 'meal-components'));

const CUISINES = ['north_indian', 'south_indian', 'both'] as const;
const DIETS = ['veg', 'non_veg'] as const;
const STYLES = ['health', 'regular'] as const;

function planToMarkdownTable(plan: WeeklyPlan): string {
  let md = '| Day | Breakfast | Lunch | Dinner |\n';
  md += '|-----|-----------|-------|--------|\n';
  for (const day of plan) {
    md += `| ${day.day} | ${day.breakfast.name} | ${day.lunch.name} | ${day.dinner.name} |\n`;
  }
  return md;
}

async function generatePlan(
  cuisine: string, diet: string, style: string,
  lunchFormat: MealFormat, dinnerFormat: MealFormat,
): Promise<WeeklyPlan> {
  const deps: DishPreviewDeps = { mealRepository: mealRepo, mealComponentRepository: componentRepo };
  const candidates = await generateCandidateDishes(deps, { cuisine, diet, style }, []);
  return buildPlanFromComponents(candidates, { cuisine, diet, lunchFormat, dinnerFormat });
}

function parseArgs() {
  const args = process.argv.slice(2);
  let combo: string | undefined;
  let count = 2;
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

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let md = '# 🍽️ Candidate Weekly Plans\n\n';
  md += `Generated: ${new Date().toISOString().split('T')[0]}\n`;
  md += `Lunch format: **${lunchFormat}** | Dinner format: **${dinnerFormat}**\n\n`;
  md += '---\n\n';

  const combos: [string, string, string][] = [];
  if (combo) {
    const [c, d, s] = combo.split('-');
    combos.push([c, d, s]);
  } else {
    for (const c of CUISINES) for (const d of DIETS) for (const s of STYLES) combos.push([c, d, s]);
  }

  for (const [cuisine, diet, style] of combos) {
    const key = `${cuisine}-${diet}-${style}`;
    md += `## ${key}\n\n`;

    for (let i = 0; i < count; i++) {
      try {
        const plan = await generatePlan(cuisine, diet, style, lunchFormat, dinnerFormat);
        md += `### Plan ${i + 1}\n\n`;
        md += planToMarkdownTable(plan);
        md += '\n';
      } catch (err) {
        md += `### Plan ${i + 1} — ❌ Failed\n\n`;
      }
    }
    md += '---\n\n';
  }

  const outPath = path.join(OUTPUT_DIR, 'PREVIEW.md');
  fs.writeFileSync(outPath, md);
  console.log(`\n✅ Preview written to ${path.relative(process.cwd(), outPath)}`);
  console.log('Open it in VS Code and use Cmd+Shift+V to preview as markdown.\n');
}

main().catch(console.error);
