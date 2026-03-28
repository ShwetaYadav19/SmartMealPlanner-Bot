#!/usr/bin/env npx tsx
/**
 * Generate or validate curated pool JSON files.
 *
 * Usage:
 *   npx tsx scripts/generate-curated-pools.ts              # generate all pools
 *   npx tsx scripts/generate-curated-pools.ts --validate   # validate existing pools
 *
 * Generated files go to data/curated-pools/{cuisine}-{diet}-{style}.json
 * Each file is human-readable with { id, name } entries — edit freely.
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonMealRepository } from '../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../src/adapters/jsonMealComponentRepository';
import type { Meal, MealComponent, ComponentCategory, CuratedPool, CuratedPoolComponentsByCategory } from '../src/core/types';

const DATA_DIR = path.resolve(__dirname, '../data');
const POOL_DIR = path.join(DATA_DIR, 'curated-pools');
const CATEGORIES: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];

const CUISINES = ['north_indian', 'south_indian', 'both'] as const;
const DIETS = ['veg', 'non_veg'] as const;
const STYLES = ['health', 'regular'] as const;
const SLOTS = ['lunch', 'dinner'] as const;

const mealRepo = new JsonMealRepository(path.join(DATA_DIR, 'meals.json'));
const componentRepo = new JsonMealComponentRepository(path.join(DATA_DIR, 'meal-components'));

function filterMeals(
  meals: Meal[],
  cuisine: string,
  diet: string,
  style: string,
): Meal[] {
  return meals.filter(m => {
    if (!m.slots.includes('breakfast')) return false;
    if (style && m.style !== style) return false;
    if (diet === 'veg' && m.diet !== 'veg') return false;
    // non_veg users see both veg and non_veg
    if (cuisine !== 'both') {
      if (!m.cuisine.includes(cuisine as 'north_indian' | 'south_indian')) return false;
    }
    return true;
  });
}

async function filterComponents(
  cuisine: string,
  diet: string,
  style: string,
  slot: 'lunch' | 'dinner',
): Promise<Record<ComponentCategory, MealComponent[]>> {
  const all = await componentRepo.getComponents({
    cuisine: cuisine as any,
    style: style as any,
    slot,
  });

  const result: Record<ComponentCategory, MealComponent[]> = {
    base: [], gravy: [], dry_veggie: [], side: [],
  };

  for (const c of all) {
    // Diet filter: veg users only see veg
    if (diet === 'veg' && c.diet !== 'veg') continue;
    // non_veg users see everything (veg + non_veg)
    if (result[c.category]) {
      result[c.category].push(c);
    }
  }
  return result;
}

function toEntries(items: { id: string; name: string }[]): { id: string; name: string }[] {
  // Deduplicate by id, preserve order
  const seen = new Set<string>();
  return items.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  }).map(i => ({ id: i.id, name: i.name }));
}

function buildSlotPool(components: Record<ComponentCategory, MealComponent[]>): CuratedPoolComponentsByCategory {
  const result: CuratedPoolComponentsByCategory = { base: [], gravy: [], dry_veggie: [], side: [] };
  for (const cat of CATEGORIES) {
    result[cat] = toEntries(components[cat]);
  }
  return result;
}

async function generatePool(cuisine: string, diet: string, style: string): Promise<CuratedPool> {
  const allMeals = await mealRepo.getMeals({});
  const breakfasts = filterMeals(allMeals, cuisine, diet, style);

  const lunchComponents = await filterComponents(cuisine, diet, style, 'lunch');
  const dinnerComponents = await filterComponents(cuisine, diet, style, 'dinner');

  return {
    breakfasts: toEntries(breakfasts),
    lunch: buildSlotPool(lunchComponents),
    dinner: buildSlotPool(dinnerComponents),
  };
}

function printSummary(key: string, pool: CuratedPool): void {
  const lunchTotal = CATEGORIES.reduce((s, c) => s + pool.lunch[c].length, 0);
  const dinnerTotal = CATEGORIES.reduce((s, c) => s + pool.dinner[c].length, 0);

  console.log(`  ${key}: ${pool.breakfasts.length} breakfasts, ${lunchTotal} lunch components, ${dinnerTotal} dinner components`);

  // Warn if any category is thin
  for (const slot of SLOTS) {
    for (const cat of CATEGORIES) {
      const count = pool[slot][cat].length;
      if (count < 2) {
        console.log(`    ⚠️  ${slot}/${cat}: only ${count} item(s) — may lack variety`);
      }
    }
  }
}

// --- Validate mode ---

async function validatePools(): Promise<void> {
  console.log('\n🔍 Validating curated pools...\n');

  const allMeals = await mealRepo.getMeals({});
  const allComponents = await componentRepo.getComponents({});
  const mealIds = new Set(allMeals.map(m => m.id));
  const componentIds = new Set(allComponents.map(c => c.id));

  const files = fs.readdirSync(POOL_DIR).filter(f => f.endsWith('.json'));
  let hasErrors = false;

  for (const file of files) {
    const filePath = path.join(POOL_DIR, file);
    const pool = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CuratedPool;
    const key = file.replace('.json', '');
    const errors: string[] = [];

    // Check breakfast IDs
    for (const entry of pool.breakfasts) {
      if (!mealIds.has(entry.id)) {
        errors.push(`breakfast "${entry.name}" (${entry.id}) not found in meals.json`);
      }
    }

    // Check component IDs
    for (const slot of SLOTS) {
      for (const cat of CATEGORIES) {
        const entries = pool[slot][cat];
        for (const entry of entries) {
          if (!componentIds.has(entry.id)) {
            errors.push(`${slot}/${cat} "${entry.name}" (${entry.id}) not found in components`);
          }
        }
        if (entries.length < 2) {
          errors.push(`${slot}/${cat} has only ${entries.length} item(s) — needs at least 2 for variety`);
        }
      }
    }

    if (errors.length > 0) {
      console.log(`❌ ${key}:`);
      for (const err of errors) console.log(`   ${err}`);
      hasErrors = true;
    } else {
      printSummary(`✅ ${key}`, pool);
    }
  }

  if (!hasErrors) {
    console.log('\n✅ All pools valid!\n');
  } else {
    console.log('\n⚠️  Some pools have issues — fix the errors above.\n');
    process.exit(1);
  }
}

// --- Generate mode ---

async function generateAll(): Promise<void> {
  console.log('\n🍽️  Generating curated pools...\n');

  if (!fs.existsSync(POOL_DIR)) {
    fs.mkdirSync(POOL_DIR, { recursive: true });
  }

  for (const cuisine of CUISINES) {
    for (const diet of DIETS) {
      for (const style of STYLES) {
        const key = `${cuisine}-${diet}-${style}`;
        const pool = await generatePool(cuisine, diet, style);
        const filePath = path.join(POOL_DIR, `${key}.json`);

        // Don't overwrite existing files — only generate missing ones
        if (fs.existsSync(filePath)) {
          console.log(`  ⏭️  ${key}.json already exists — skipping (use --force to overwrite)`);
          continue;
        }

        fs.writeFileSync(filePath, JSON.stringify(pool, null, 2) + '\n');
        printSummary(key, pool);
      }
    }
  }

  console.log(`\n✅ Done! Files in ${POOL_DIR}\n`);
  console.log('Next steps:');
  console.log('  1. Review and edit the JSON files — remove dishes you don\'t want');
  console.log('  2. Run with --validate to check your edits');
  console.log('  3. Commit the files\n');
}

// --- Main ---

const args = process.argv.slice(2);
if (args.includes('--validate')) {
  validatePools();
} else {
  generateAll();
}
