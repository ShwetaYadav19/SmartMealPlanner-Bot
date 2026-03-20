import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { Meal, MealComponent, ComponentCategory } from '../../src/core/types';

/**
 * Data sufficiency guardrails.
 *
 * Validates that meals.json and meal-components.json have enough entries
 * for every cuisine × diet × style combination to produce a full 7-day plan.
 *
 * These tests fail fast when someone adds a new preference option
 * or removes data entries, before the plan generator ever runs.
 */

const meals: Meal[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../data/meals.json'), 'utf-8'),
);
const componentsDir = path.resolve(__dirname, '../../data/meal-components');
const components: MealComponent[] = (() => {
  const seen = new Set<string>();
  const all: MealComponent[] = [];
  for (const f of fs.readdirSync(componentsDir).filter(f => f.endsWith('.json')).sort()) {
    for (const item of JSON.parse(fs.readFileSync(path.join(componentsDir, f), 'utf-8')) as MealComponent[]) {
      if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
    }
  }
  return all;
})();

const CUISINES = ['north_indian', 'south_indian'] as const;
const DIETS = ['veg', 'non_veg'] as const;
const STYLES = ['health', 'regular'] as const;
const CATEGORIES: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];

// Minimum breakfasts needed for 7-day variety with a 3-day sliding window
const MIN_BREAKFASTS = 4;
// Minimum components per category per cuisine/style for composeMeal to work
const MIN_COMPONENTS_PER_CATEGORY = 3;
// Minimum non-veg items per protein category (gravy, dry_veggie)
const MIN_NON_VEG_PER_PROTEIN_CATEGORY = 2;

describe('Data sufficiency: breakfasts', () => {
  for (const cuisine of CUISINES) {
    for (const diet of DIETS) {
      for (const style of STYLES) {
        it(`${cuisine}/${diet}/${style} has >= ${MIN_BREAKFASTS} breakfasts`, () => {
          const count = meals.filter(
            (m) =>
              m.cuisine.includes(cuisine) &&
              m.diet === diet &&
              m.style === style &&
              m.slots.includes('breakfast'),
          ).length;
          expect(count).toBeGreaterThanOrEqual(MIN_BREAKFASTS);
        });
      }
    }
  }
});

describe('Data sufficiency: components per category', () => {
  for (const cuisine of CUISINES) {
    for (const style of STYLES) {
      for (const category of CATEGORIES) {
        for (const slot of ['lunch', 'dinner'] as const) {
          // Sides and bases are exempt from same-day dedup, so 2 is enough
          const minRequired = (category === 'side' || category === 'base') ? 2 : MIN_COMPONENTS_PER_CATEGORY;
          it(`${cuisine}/${style}/${category}/${slot} has >= ${minRequired} components`, () => {
            const count = components.filter(
              (c) =>
                c.cuisine.includes(cuisine) &&
                c.style === style &&
                c.category === category &&
                c.slots.includes(slot),
            ).length;
            expect(count).toBeGreaterThanOrEqual(minRequired);
          });
        }
      }
    }
  }
});

describe('Data sufficiency: non-veg components for protein categories', () => {
  for (const cuisine of CUISINES) {
    for (const style of STYLES) {
      for (const category of ['gravy', 'dry_veggie'] as ComponentCategory[]) {
        it(`${cuisine}/${style}/${category} has >= ${MIN_NON_VEG_PER_PROTEIN_CATEGORY} non-veg items`, () => {
          const count = components.filter(
            (c) =>
              c.cuisine.includes(cuisine) &&
              c.style === style &&
              c.category === category &&
              c.diet === 'non_veg',
          ).length;
          expect(count).toBeGreaterThanOrEqual(MIN_NON_VEG_PER_PROTEIN_CATEGORY);
        });
      }
    }
  }
});

describe('Data sufficiency: component schema validity', () => {
  it('all component IDs are unique', () => {
    const ids = components.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every component has valid category, cuisine, diet, style, and non-empty slots', () => {
    for (const c of components) {
      expect(CATEGORIES).toContain(c.category);
      expect(Array.isArray(c.cuisine)).toBe(true);
      expect(c.cuisine.length).toBeGreaterThan(0);
      for (const cui of c.cuisine) {
        expect(['north_indian', 'south_indian']).toContain(cui);
      }
      expect(['veg', 'non_veg']).toContain(c.diet);
      expect(['health', 'regular']).toContain(c.style);
      expect(c.slots.length).toBeGreaterThan(0);
      for (const s of c.slots) {
        expect(['lunch', 'dinner']).toContain(s);
      }
    }
  });

  it('every component has non-empty ingredients', () => {
    for (const c of components) {
      expect(c.ingredients.length).toBeGreaterThan(0);
      for (const ing of c.ingredients) {
        expect(ing.name.length).toBeGreaterThan(0);
        expect(ing.quantity.length).toBeGreaterThan(0);
        expect(ing.category.length).toBeGreaterThan(0);
      }
    }
  });
});
