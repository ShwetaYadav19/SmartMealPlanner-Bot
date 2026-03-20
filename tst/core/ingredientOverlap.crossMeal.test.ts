import { describe, it, expect } from 'vitest';
import { composeMeal, getSignatureIngredientNames, type ComposeMealConstraints } from '../../src/core/planGenerator';
import type { MealComponent } from '../../src/core/types';

// ── Helpers ─────────────────────────────────────────────────

/** Build a MealComponent with the given properties. */
function mc(
  id: string,
  name: string,
  category: MealComponent['category'],
  ingredients: MealComponent['ingredients'],
): MealComponent {
  return {
    id,
    name,
    category,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients,
  };
}

/** Empty constraints — no recent or same-day IDs. */
const emptyConstraints: ComposeMealConstraints = {
  base:       { recentIds: new Set(), sameDayIds: new Set() },
  gravy:      { recentIds: new Set(), sameDayIds: new Set() },
  dry_veggie: { recentIds: new Set(), sameDayIds: new Set() },
  side:       { recentIds: new Set(), sameDayIds: new Set() },
};

// ── Test data ───────────────────────────────────────────────

// Two bases
const base1 = mc('base-001', 'Steamed Rice', 'base', [
  { name: 'Rice', quantity: '300g', category: 'grains' },
]);
const base2 = mc('base-002', 'Roti', 'base', [
  { name: 'Whole Wheat Flour', quantity: '200g', category: 'grains' },
]);

// Gravy A: has Toor Dal (lentils) — shares signature ingredient with lunchGravyRef
const gravyA = mc('gravy-overlap', 'Dal Tadka', 'gravy', [
  { name: 'Toor Dal', quantity: '150g', category: 'lentils' },
  { name: 'Onion', quantity: '1 medium', category: 'vegetables' },
  { name: 'Ghee', quantity: '1 tbsp', category: 'dairy' },
]);

// Gravy B: has Toor Dal (lentils) — also shares signature ingredient with lunchGravyRef
const gravyB = mc('gravy-overlap-2', 'Sambar', 'gravy', [
  { name: 'Toor Dal', quantity: '100g', category: 'lentils' },
  { name: 'Drumstick', quantity: '1', category: 'vegetables' },
  { name: 'Sambar Powder', quantity: '2 tbsp', category: 'spices' },
]);

// Gravy C: NO Toor Dal — uses Rajma (different lentil), no overlap with lunchGravyRef
const gravyC = mc('gravy-no-overlap', 'Rajma', 'gravy', [
  { name: 'Rajma (Kidney Beans)', quantity: '200g', category: 'lentils' },
  { name: 'Onion', quantity: '1 medium', category: 'vegetables' },
  { name: 'Tomato', quantity: '2 medium', category: 'vegetables' },
]);

// Two dry_veggies
const dry1 = mc('dry-001', 'Aloo Gobi', 'dry_veggie', [
  { name: 'Cauliflower', quantity: '200g', category: 'vegetables' },
  { name: 'Potato', quantity: '100g', category: 'vegetables' },
]);
const dry2 = mc('dry-002', 'Bhindi Masala', 'dry_veggie', [
  { name: 'Okra', quantity: '200g', category: 'vegetables' },
  { name: 'Onion', quantity: '1 small', category: 'vegetables' },
]);

// Two sides
const side1 = mc('side-001', 'Curd', 'side', [
  { name: 'Yogurt', quantity: '150g', category: 'dairy' },
]);
const side2 = mc('side-002', 'Papad', 'side', [
  { name: 'Papad', quantity: '2', category: 'grains' },
]);

// Lunch gravy ref: has Toor Dal (lentils) — the signature ingredient to avoid
const lunchGravyRef = mc('lunch-gravy', 'Moong Dal', 'gravy', [
  { name: 'Toor Dal', quantity: '100g', category: 'lentils' },
  { name: 'Cumin Seeds', quantity: '1 tsp', category: 'spices' },
  { name: 'Ghee', quantity: '1 tbsp', category: 'dairy' },
]);

// ── Tests ───────────────────────────────────────────────────

describe('Cross-meal gravy overlap', () => {
  it('dinner gravy avoids sharing signature ingredient with lunch gravy', () => {
    // Pool: gravyA and gravyB both share "Toor Dal" with lunchGravyRef,
    // gravyC does NOT share "Toor Dal" (uses Rajma instead).
    // composeMeal should pick gravyC for dinner when lunchGravyRef is provided.
    const pool: MealComponent[] = [
      base1, base2,
      gravyA, gravyB, gravyC,
      dry1, dry2,
      side1, side2,
    ];

    const lunchSigNames = getSignatureIngredientNames(lunchGravyRef);

    // Run multiple iterations to account for randomization (fisherYatesShuffle)
    const iterations = 30;
    for (let i = 0; i < iterations; i++) {
      const result = composeMeal(
        pool,
        'dinner',
        'north_indian',
        emptyConstraints,
        undefined,   // diet
        undefined,   // mealSelector
        undefined,   // constraintRules
        undefined,   // constraintContext
        lunchGravyRef,
      );

      const dinnerGravy = result.components.find(c => c.category === 'gravy')!;
      const dinnerSigNames = getSignatureIngredientNames(dinnerGravy);

      // Assert: dinner gravy does NOT share any signature ingredient with lunch gravy
      for (const name of lunchSigNames) {
        expect(dinnerSigNames.has(name)).toBe(false);
      }
    }
  });
});
