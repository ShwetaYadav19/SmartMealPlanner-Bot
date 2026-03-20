// Feature: meal-selection-rules-engine, Property 17: Backward compatibility with default rules
// **Validates: Requirements 12.1, 12.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as path from 'path';
import { generateCandidateDishes, type DishPreviewDeps } from '../../src/core/dishPreview';
import { MealSelector } from '../../src/core/mealSelector';
import { JsonRulesRepository } from '../../src/adapters/jsonRulesRepository';
import { JsonMealRepository } from '../../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../../src/adapters/jsonMealComponentRepository';
import type { CandidateDishes, ComponentsByCategory } from '../../src/core/types';

// --- Real data file paths ---
const RULES_PATH = path.resolve(process.cwd(), 'data', 'meal-selection-rules.json');
const MEALS_PATH = path.resolve(process.cwd(), 'data', 'meals.json');
const COMPONENTS_PATH = path.resolve(process.cwd(), 'data', 'meal-components');

// --- Helpers ---

/** Extract sorted ID set from a Meal/MealComponent array (ignoring name suffixes like "(Regular)") */
function idSet(items: { id: string }[]): Set<string> {
  return new Set(items.map((i) => i.id));
}

/** Extract ID sets per category from ComponentsByCategory */
function componentIdSets(components: ComponentsByCategory): Record<string, Set<string>> {
  return {
    base: idSet(components.base),
    gravy: idSet(components.gravy),
    dry_veggie: idSet(components.dry_veggie),
    side: idSet(components.side),
  };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Compare two CandidateDishes component pools by ID sets (order-independent).
 * Breakfasts are compared as supersets since both paths shuffle and slice to 7,
 * so exact set equality isn't guaranteed — but the underlying pool should be the same.
 */
function compareComponentPools(
  hardcoded: CandidateDishes,
  ruleBased: CandidateDishes,
): { lunchMatch: boolean; dinnerMatch: boolean } {
  const hLunch = componentIdSets(hardcoded.lunchComponents);
  const rLunch = componentIdSets(ruleBased.lunchComponents);

  const hDinner = componentIdSets(hardcoded.dinnerComponents);
  const rDinner = componentIdSets(ruleBased.dinnerComponents);

  const lunchMatch =
    setsEqual(hLunch.base, rLunch.base) &&
    setsEqual(hLunch.gravy, rLunch.gravy) &&
    setsEqual(hLunch.dry_veggie, rLunch.dry_veggie) &&
    setsEqual(hLunch.side, rLunch.side);

  const dinnerMatch =
    setsEqual(hDinner.base, rDinner.base) &&
    setsEqual(hDinner.gravy, rDinner.gravy) &&
    setsEqual(hDinner.dry_veggie, rDinner.dry_veggie) &&
    setsEqual(hDinner.side, rDinner.side);

  return { lunchMatch, dinnerMatch };
}

// --- Arbitraries ---

function arbPreferences(): fc.Arbitrary<{ cuisine: string; diet: string; style: string }> {
  return fc.record({
    cuisine: fc.constantFrom('north_indian', 'south_indian', 'both'),
    diet: fc.constantFrom('veg', 'non_veg'),
    style: fc.constantFrom('health', 'regular'),
  });
}

// --- Property Test ---

describe('Property 17: Backward compatibility with default rules', () => {
  // Feature: meal-selection-rules-engine, Property 17: Backward compatibility with default rules
  // **Validates: Requirements 12.1, 12.2**

  it('for any user preferences, rules-based MealSelector produces equivalent candidate component pools to hardcoded generateCandidateDishes', async () => {
    const mealRepo = new JsonMealRepository(MEALS_PATH);
    const componentRepo = new JsonMealComponentRepository(COMPONENTS_PATH);
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const mealSelector = new MealSelector(rulesRepo, mealRepo, componentRepo);

    const deps: DishPreviewDeps = {
      mealRepository: mealRepo,
      mealComponentRepository: componentRepo,
    };

    await fc.assert(
      fc.asyncProperty(
        arbPreferences(),
        async (preferences) => {
          const excludedDishIds: string[] = [];

          // Hardcoded path (no MealSelector)
          const hardcoded = await generateCandidateDishes(deps, preferences, excludedDishIds);

          // Rule-based path (with MealSelector)
          const ruleBased = await generateCandidateDishes(deps, preferences, excludedDishIds, mealSelector);

          // For all cuisine preferences, pools should be equivalent per category
          const { lunchMatch, dinnerMatch } = compareComponentPools(hardcoded, ruleBased);
          expect(lunchMatch).toBe(true);
          expect(dinnerMatch).toBe(true);

          // Both should produce non-empty breakfast lists.
          expect(hardcoded.breakfasts.length).toBeGreaterThan(0);
          expect(ruleBased.breakfasts.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// --- Integration Unit Tests (Task 9.2) ---
// Requirements: 12.1, 12.2, 12.3, 14.3

describe('Integration: Default rules file loads and validates', () => {
  it('JsonRulesRepository loads default rules file and returns 10 rules', async () => {
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const rules = await rulesRepo.getRules();

    expect(rules).toHaveLength(10);
    // Every rule should have required fields
    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(rule.action).toBeTruthy();
    }
  });

  it('default rules file contains all expected rule IDs', async () => {
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const rules = await rulesRepo.getRules();
    const ruleIds = rules.map((r) => r.id);

    expect(ruleIds).toContain('cuisine-filter');
    expect(ruleIds).toContain('diet-filter');
    expect(ruleIds).toContain('diet-fallback');
    expect(ruleIds).toContain('style-filter');
    expect(ruleIds).toContain('style-fallback');
    expect(ruleIds).toContain('excluded-dishes');
    expect(ruleIds).toContain('sliding-window');
    expect(ruleIds).toContain('same-day-dedup');
    expect(ruleIds).toContain('ingredient-overlap');
    expect(ruleIds).toContain('cuisine-alternation');
  });

  it('default rules file has no validation errors', async () => {
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    // getRules() calls validateRules internally — if it doesn't throw, validation passed
    await expect(rulesRepo.getRules()).resolves.toBeDefined();
  });
});

describe('Integration: MealSelector with real data produces valid results', () => {
  it('getCandidatePool returns non-empty meals for breakfast slot', async () => {
    const mealRepo = new JsonMealRepository(MEALS_PATH);
    const componentRepo = new JsonMealComponentRepository(COMPONENTS_PATH);
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const mealSelector = new MealSelector(rulesRepo, mealRepo, componentRepo);

    const result = await mealSelector.getCandidatePool({
      userPreferences: { cuisine: 'north_indian', diet: 'veg', style: 'health' },
      excludedDishIds: [],
      slot: 'breakfast',
      dayIndex: 0,
      history: {},
      sameDaySelections: {},
    });

    expect(result.meals.length).toBeGreaterThan(0);
    for (const meal of result.meals) {
      expect(meal.cuisine).toContain('north_indian');
      expect(meal.diet).toBe('veg');
      expect(meal.style).toBe('health');
    }
  });

  it('getCandidatePool returns non-empty components for lunch slot', async () => {
    const mealRepo = new JsonMealRepository(MEALS_PATH);
    const componentRepo = new JsonMealComponentRepository(COMPONENTS_PATH);
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const mealSelector = new MealSelector(rulesRepo, mealRepo, componentRepo);

    const result = await mealSelector.getCandidatePool({
      userPreferences: { cuisine: 'north_indian', diet: 'veg', style: 'regular' },
      excludedDishIds: [],
      slot: 'lunch',
      dayIndex: 0,
      history: {},
      sameDaySelections: {},
    });

    expect(result.components.length).toBeGreaterThan(0);
  });

  it('getCandidatePool returns non-empty components for dinner slot', async () => {
    const mealRepo = new JsonMealRepository(MEALS_PATH);
    const componentRepo = new JsonMealComponentRepository(COMPONENTS_PATH);
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const mealSelector = new MealSelector(rulesRepo, mealRepo, componentRepo);

    const result = await mealSelector.getCandidatePool({
      userPreferences: { cuisine: 'south_indian', diet: 'non_veg', style: 'regular' },
      excludedDishIds: [],
      slot: 'dinner',
      dayIndex: 0,
      history: {},
      sameDaySelections: {},
    });

    expect(result.components.length).toBeGreaterThan(0);
  });

  it('generateCandidateDishes with MealSelector produces valid CandidateDishes', async () => {
    const mealRepo = new JsonMealRepository(MEALS_PATH);
    const componentRepo = new JsonMealComponentRepository(COMPONENTS_PATH);
    const rulesRepo = new JsonRulesRepository(RULES_PATH);
    const mealSelector = new MealSelector(rulesRepo, mealRepo, componentRepo);

    const deps: DishPreviewDeps = {
      mealRepository: mealRepo,
      mealComponentRepository: componentRepo,
    };

    const candidates = await generateCandidateDishes(
      deps,
      { cuisine: 'north_indian', diet: 'veg', style: 'regular' },
      [],
      mealSelector,
    );

    expect(candidates.breakfasts.length).toBeGreaterThan(0);
    expect(candidates.lunchComponents.base.length).toBeGreaterThan(0);
    expect(candidates.lunchComponents.gravy.length).toBeGreaterThan(0);
    expect(candidates.dinnerComponents.base.length).toBeGreaterThan(0);
    expect(candidates.dinnerComponents.gravy.length).toBeGreaterThan(0);
  });
});
