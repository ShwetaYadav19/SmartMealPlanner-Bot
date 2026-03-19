import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { JsonRulesRepository } from '../../src/adapters/jsonRulesRepository';
import { JsonMealRepository } from '../../src/adapters/jsonMealRepository';
import { JsonMealComponentRepository } from '../../src/adapters/jsonMealComponentRepository';
import { MealSelector } from '../../src/core/mealSelector';
import type { RuleEvaluationContext } from '../../src/core/types';

// Resolve real data file paths relative to project root
const dataDir = path.resolve(__dirname, '..', '..', 'data');
const rulesPath = path.join(dataDir, 'meal-selection-rules.json');
const mealsPath = path.join(dataDir, 'meals.json');
const componentsPath = path.join(dataDir, 'meal-components.json');

function makeContext(overrides?: Partial<RuleEvaluationContext>): RuleEvaluationContext {
  return {
    userPreferences: { cuisine: 'both', diet: 'non_veg', style: 'health' },
    excludedDishIds: [],
    slot: 'breakfast',
    dayIndex: 0,
    history: {},
    sameDaySelections: {},
    ...overrides,
  };
}

describe('MealSelector integration with real data files', () => {
  // _Requirements: 12.1, 12.2, 12.3, 14.3_

  const rulesRepo = new JsonRulesRepository(rulesPath);
  const mealRepo = new JsonMealRepository(mealsPath);
  const componentRepo = new JsonMealComponentRepository(componentsPath);
  const selector = new MealSelector(rulesRepo, mealRepo, componentRepo);

  describe('default rules file loads and validates successfully', () => {
    it('loads rules without throwing', async () => {
      const rules = await rulesRepo.getRules();
      expect(rules).toBeDefined();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('contains all 10 expected rule IDs', async () => {
      const rules = await rulesRepo.getRules();
      const ids = rules.map((r) => r.id);
      const expectedIds = [
        'cuisine-filter',
        'diet-filter',
        'diet-fallback',
        'style-filter',
        'style-fallback',
        'excluded-dishes',
        'sliding-window',
        'same-day-dedup',
        'ingredient-overlap',
        'cuisine-alternation',
      ];
      for (const id of expectedIds) {
        expect(ids).toContain(id);
      }
    });

    it('every rule has a non-empty human-readable description', async () => {
      const rules = await rulesRepo.getRules();
      for (const rule of rules) {
        expect(rule.description.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('MealSelector produces valid candidate pools with real data', () => {
    it('returns non-empty breakfast pool for "both" cuisine, non_veg, health', async () => {
      const ctx = makeContext({ slot: 'breakfast' });
      const { meals } = await selector.getCandidatePool(ctx);
      expect(meals.length).toBeGreaterThan(0);
      // At least some returned meals should have breakfast in their slots
      const breakfastMeals = meals.filter(m => m.slots.includes('breakfast'));
      expect(breakfastMeals.length).toBeGreaterThan(0);
    });

    it('returns non-empty lunch component pool', async () => {
      const ctx = makeContext({ slot: 'lunch' });
      const { components } = await selector.getCandidatePool(ctx);
      expect(components.length).toBeGreaterThan(0);
      for (const comp of components) {
        expect(comp.slots).toContain('lunch');
      }
    });

    it('returns non-empty dinner component pool', async () => {
      const ctx = makeContext({ slot: 'dinner' });
      const { components } = await selector.getCandidatePool(ctx);
      expect(components.length).toBeGreaterThan(0);
      for (const comp of components) {
        expect(comp.slots).toContain('dinner');
      }
    });

    it('veg diet returns only veg items for breakfast', async () => {
      const ctx = makeContext({
        slot: 'breakfast',
        userPreferences: { cuisine: 'both', diet: 'veg', style: 'health' },
      });
      const { meals } = await selector.getCandidatePool(ctx);
      expect(meals.length).toBeGreaterThan(0);
      for (const meal of meals) {
        expect(meal.diet).toBe('veg');
      }
    });

    it('north_indian cuisine returns only north_indian breakfasts', async () => {
      const ctx = makeContext({
        slot: 'breakfast',
        userPreferences: { cuisine: 'north_indian', diet: 'non_veg', style: 'health' },
      });
      const { meals } = await selector.getCandidatePool(ctx);
      expect(meals.length).toBeGreaterThan(0);
      for (const meal of meals) {
        expect(meal.cuisine).toContain('north_indian');
      }
    });

    it('excluded dish IDs are removed from the pool', async () => {
      // First get the full pool to pick an ID to exclude
      const fullCtx = makeContext({ slot: 'breakfast' });
      const { meals: fullMeals } = await selector.getCandidatePool(fullCtx);
      expect(fullMeals.length).toBeGreaterThan(0);

      const excludedId = fullMeals[0].id;
      const ctx = makeContext({
        slot: 'breakfast',
        excludedDishIds: [excludedId],
      });
      const { meals } = await selector.getCandidatePool(ctx);
      const ids = meals.map((m) => m.id);
      expect(ids).not.toContain(excludedId);
    });
  });
});
