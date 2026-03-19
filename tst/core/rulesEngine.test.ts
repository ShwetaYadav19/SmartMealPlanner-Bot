import { describe, it, expect } from 'vitest';
import { validateRules, parseRules, serializeRules, getApplicableRules } from '../../src/core/rulesEngine';
import type { Rule, RuleScope, RuleEvaluationContext } from '../../src/core/types';

// --- Helpers ---

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    scope: 'all_slots',
    action: 'filter',
    conditions: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<RuleEvaluationContext> = {}): RuleEvaluationContext {
  return {
    userPreferences: { cuisine: 'north_indian', diet: 'veg', style: 'health' },
    excludedDishIds: [],
    slot: 'lunch',
    dayIndex: 0,
    history: {},
    sameDaySelections: {},
    ...overrides,
  };
}

// --- validateRules ---

describe('validateRules', () => {
  it('empty array passes validation', () => {
    expect(() => validateRules([])).not.toThrow();
  });

  it('single valid rule passes', () => {
    expect(() => validateRules([makeRule()])).not.toThrow();
  });

  it('missing id throws with "missing required field \\"id\\""', () => {
    const rule = makeRule({ id: undefined as unknown as string });
    expect(() => validateRules([rule])).toThrowError('missing required field "id"');
  });

  it('empty name throws with "missing required field \\"name\\""', () => {
    const rule = makeRule({ name: '' });
    expect(() => validateRules([rule])).toThrowError('missing required field "name"');
  });

  it('empty description throws with "missing required field \\"description\\""', () => {
    const rule = makeRule({ description: '   ' });
    expect(() => validateRules([rule])).toThrowError('missing required field "description"');
  });

  it('missing action throws with "missing required field \\"action\\""', () => {
    const rule = makeRule({ action: undefined as unknown as Rule['action'] });
    expect(() => validateRules([rule])).toThrowError('missing required field "action"');
  });

  it('duplicate IDs throws with the duplicate ID in the message', () => {
    const rules = [makeRule({ id: 'dup-id' }), makeRule({ id: 'dup-id', name: 'Another' })];
    expect(() => validateRules(rules)).toThrowError('dup-id');
  });

  it('unknown action type throws with "unknown action type"', () => {
    const rule = makeRule({ action: 'delete' as Rule['action'] });
    expect(() => validateRules([rule])).toThrowError('unknown action type');
  });

  it('unknown scope value throws with "unknown scope value"', () => {
    const rule = makeRule({ scope: 'snack' as RuleScope });
    expect(() => validateRules([rule])).toThrowError('unknown scope value');
  });
});

// --- parseRules ---

describe('parseRules', () => {
  it('valid JSON array parses correctly', () => {
    const rules = [makeRule()];
    const json = JSON.stringify(rules);
    const parsed = parseRules(json);
    expect(parsed).toEqual(rules);
  });

  it('invalid JSON throws with file path when provided', () => {
    expect(() => parseRules('not-json', '/path/to/rules.json')).toThrowError('/path/to/rules.json');
  });

  it('invalid JSON throws without file path when not provided', () => {
    expect(() => parseRules('not-json')).toThrowError('Failed to parse rules:');
    expect(() => parseRules('not-json')).not.toThrowError('Failed to parse rules file');
  });
});

// --- serializeRules ---

describe('serializeRules', () => {
  it('produces formatted JSON with 2-space indent', () => {
    const rules = [makeRule()];
    const serialized = serializeRules(rules);
    expect(serialized).toBe(JSON.stringify(rules, null, 2));
  });

  it('empty array serializes to "[]"', () => {
    expect(serializeRules([])).toBe('[]');
  });
});

// --- getApplicableRules ---

describe('getApplicableRules', () => {
  const ctx = makeContext();

  const breakfastRule = makeRule({ id: 'r-breakfast', scope: 'breakfast' });
  const lunchRule = makeRule({ id: 'r-lunch', scope: 'lunch_component' });
  const dinnerRule = makeRule({ id: 'r-dinner', scope: 'dinner_component' });
  const allSlotsRule = makeRule({ id: 'r-all', scope: 'all_slots' });

  const allRules = [breakfastRule, lunchRule, dinnerRule, allSlotsRule];

  it('returns rules matching the given scope', () => {
    const result = getApplicableRules(allRules, 'breakfast', ctx);
    expect(result).toContainEqual(breakfastRule);
  });

  it('returns rules with scope all_slots for any scope', () => {
    for (const scope of ['breakfast', 'lunch_component', 'dinner_component'] as RuleScope[]) {
      const result = getApplicableRules(allRules, scope, ctx);
      expect(result).toContainEqual(allSlotsRule);
    }
  });

  it('excludes rules with non-matching scope', () => {
    const result = getApplicableRules(allRules, 'breakfast', ctx);
    expect(result).not.toContainEqual(lunchRule);
    expect(result).not.toContainEqual(dinnerRule);
  });

  it('returns rules in declaration order', () => {
    const rules = [allSlotsRule, breakfastRule, makeRule({ id: 'r-all2', scope: 'all_slots' })];
    const result = getApplicableRules(rules, 'breakfast', ctx);
    expect(result[0].id).toBe('r-all');
    expect(result[1].id).toBe('r-breakfast');
    expect(result[2].id).toBe('r-all2');
  });

  it('returns empty array when no rules match', () => {
    const result = getApplicableRules([lunchRule, dinnerRule], 'breakfast', ctx);
    expect(result).toEqual([]);
  });
});
