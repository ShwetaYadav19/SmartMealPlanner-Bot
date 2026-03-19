import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import type { Meal } from '../../src/core/types';

/**
 * Property 14: Meal data schema validity
 * Validates: Requirements 15.2
 *
 * Every entry in data/meals.json must have all required fields
 * with correct types and values matching the Meal interface.
 */

const mealsPath = path.resolve(__dirname, '../../data/meals.json');
const rawData = JSON.parse(fs.readFileSync(mealsPath, 'utf-8'));
const meals: unknown[] = rawData;

const VALID_CUISINES = ['north_indian', 'south_indian'] as const;
const VALID_DIETS = ['veg', 'non_veg'] as const;
const VALID_STYLES = ['health', 'regular'] as const;
const VALID_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
const CUISINE_PREFIXES: Record<string, string> = { north_indian: 'ni', south_indian: 'si' };
const SLOT_PREFIXES: Record<string, string> = { breakfast: 'b', lunch: 'l', dinner: 'd' };

describe('Property 14: Meal data schema validity', () => {
  it('meals.json is a non-empty array', () => {
    expect(Array.isArray(rawData)).toBe(true);
    expect(meals.length).toBeGreaterThan(0);
  });

  /**
   * **Validates: Requirements 15.2**
   * Every meal entry has all required fields with correct types and valid enum values.
   */
  it('every meal has all required fields with correct types and values', () => {
    fc.assert(
      fc.property(fc.constantFrom(...meals), (meal: unknown) => {
        const m = meal as Record<string, unknown>;

        // Required string fields exist and are non-empty strings
        expect(typeof m.id).toBe('string');
        expect((m.id as string).length).toBeGreaterThan(0);

        expect(typeof m.name).toBe('string');
        expect((m.name as string).length).toBeGreaterThan(0);

        // cuisine is a non-empty array of valid enum values
        expect(Array.isArray(m.cuisine)).toBe(true);
        const cuisines = m.cuisine as unknown as string[];
        expect(cuisines.length).toBeGreaterThan(0);
        cuisines.forEach((c) => {
          expect(VALID_CUISINES).toContain(c);
        });

        // diet is a valid enum value
        expect(VALID_DIETS).toContain(m.diet);

        // style is a valid enum value
        expect(VALID_STYLES).toContain(m.style);

        // slots is a non-empty array of valid slot values
        expect(Array.isArray(m.slots)).toBe(true);
        const slots = m.slots as string[];
        expect(slots.length).toBeGreaterThan(0);
        slots.forEach((slot) => {
          expect(VALID_SLOTS).toContain(slot);
        });

        // ingredients is a non-empty array with valid structure
        expect(Array.isArray(m.ingredients)).toBe(true);
        const ingredients = m.ingredients as Record<string, unknown>[];
        expect(ingredients.length).toBeGreaterThan(0);
        ingredients.forEach((ing) => {
          expect(typeof ing.name).toBe('string');
          expect((ing.name as string).length).toBeGreaterThan(0);
          expect(typeof ing.quantity).toBe('string');
          expect((ing.quantity as string).length).toBeGreaterThan(0);
          expect(typeof ing.category).toBe('string');
          expect((ing.category as string).length).toBeGreaterThan(0);
        });
      }),
      { numRuns: meals.length }
    );
  });

  /**
   * **Validates: Requirements 15.2**
   * Every meal ID follows the convention: {cuisine_prefix}-{slot_prefix}-{number}
   */
  it('every meal ID follows the naming convention', () => {
    fc.assert(
      fc.property(fc.constantFrom(...meals), (meal: unknown) => {
        const m = meal as Meal;
        const idPattern = /^(ni|si)-(b|l|d)-\d{3}$/;
        expect(m.id).toMatch(idPattern);

        // Cuisine prefix matches the cuisine field
        const expectedCuisinePrefixes = m.cuisine.map((c) => CUISINE_PREFIXES[c]);
        const idCuisinePrefix = m.id.split('-')[0];
        expect(expectedCuisinePrefixes).toContain(idCuisinePrefix);

        // Slot prefix matches one of the meal's slots
        const idSlotPrefix = m.id.split('-')[1];
        const validSlotPrefixes = m.slots.map((s) => SLOT_PREFIXES[s]);
        expect(validSlotPrefixes).toContain(idSlotPrefix);
      }),
      { numRuns: meals.length }
    );
  });

  /**
   * **Validates: Requirements 15.2**
   * All meal IDs are unique across the dataset.
   */
  it('all meal IDs are unique', () => {
    const ids = (meals as Meal[]).map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
