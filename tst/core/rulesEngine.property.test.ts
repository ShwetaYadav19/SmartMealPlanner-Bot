// Feature: meal-selection-rules-engine, Property 1: Rules file round-trip
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseRules, serializeRules, validateRules } from '../../src/core/rulesEngine';
import type { Rule, RuleAction, RuleScope, RuleConditions, ComponentCategory } from '../../src/core/types';

// --- Custom Arbitraries ---

const arbRuleAction: fc.Arbitrary<RuleAction> = fc.constantFrom('filter', 'prefer', 'constrain', 'limit');

const arbRuleScope: fc.Arbitrary<RuleScope> = fc.constantFrom(
  'breakfast',
  'lunch_component',
  'dinner_component',
  'all_slots',
);

const arbComponentCategory: fc.Arbitrary<ComponentCategory> = fc.constantFrom(
  'base',
  'gravy',
  'dry_veggie',
  'side',
);

const arbPreferenceField: fc.Arbitrary<'cuisine' | 'diet' | 'style'> = fc.constantFrom(
  'cuisine',
  'diet',
  'style',
);

const arbConstraintType: fc.Arbitrary<'same_day_dedup' | 'ingredient_overlap' | 'cuisine_alternation'> =
  fc.constantFrom('same_day_dedup', 'ingredient_overlap', 'cuisine_alternation');

const arbRuleConditions: fc.Arbitrary<RuleConditions> = fc.record(
  {
    preferenceField: arbPreferenceField,
    preferenceValues: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
    constraintType: arbConstraintType,
    windowSize: fc.integer({ min: 1, max: 14 }),
    whitelist: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
    keyIngredients: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
  },
  { requiredKeys: [] },
);

/** Generates a non-empty alphanumeric string suitable for rule IDs */
const arbRuleId: fc.Arbitrary<string> = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,19}$/);

/** Simple JSON-serializable values for parameters */
const arbSimpleValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 30 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

const arbParameters: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  arbSimpleValue,
  { minKeys: 1, maxKeys: 5 },
);

/** Generates a valid Rule object */
function arbRule(): fc.Arbitrary<Rule> {
  return fc.record(
    {
      id: arbRuleId,
      name: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      scope: arbRuleScope,
      categories: fc.array(arbComponentCategory, { minLength: 1, maxLength: 4 }),
      action: arbRuleAction,
      conditions: arbRuleConditions,
      parameters: arbParameters,
    },
    { requiredKeys: ['id', 'name', 'description', 'scope', 'action', 'conditions'] },
  );
}

/** Generates an array of rules with unique IDs */
function arbRuleArray(): fc.Arbitrary<Rule[]> {
  return fc
    .array(arbRule(), { minLength: 0, maxLength: 10 })
    .map((rules) => {
      const seen = new Set<string>();
      return rules.filter((rule) => {
        if (seen.has(rule.id)) return false;
        seen.add(rule.id);
        return true;
      });
    });
}

// --- Property Tests ---

describe('Property 1: Rules file round-trip', () => {
  // **Validates: Requirements 11.1, 11.2, 11.3**

  it('parseRules(serializeRules(rules)) deep-equals rules for any valid Rule array', () => {
    fc.assert(
      fc.property(arbRuleArray(), (rules) => {
        const serialized = serializeRules(rules);
        const parsed = parseRules(serialized);
        expect(parsed).toEqual(rules);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 2: Validation rejects missing or empty required fields
describe('Property 2: Validation rejects missing or empty required fields', () => {
  // **Validates: Requirements 2.2**

  /** Generates a rule guaranteed to pass validation (non-blank required fields) */
  const arbValidRule: fc.Arbitrary<Rule> = arbRule().map((rule) => ({
    ...rule,
    id: rule.id || 'valid-id',
    name: rule.name && rule.name.trim() ? rule.name : 'ValidName',
    description: rule.description && rule.description.trim() ? rule.description : 'ValidDescription',
    action: rule.action || 'filter',
  }));

  const requiredFields: (keyof Rule)[] = ['id', 'name', 'description', 'action'];

  it('for any Rule with a missing or empty required field, validateRules rejects and reports the field', () => {
    fc.assert(
      fc.property(
        arbValidRule,
        fc.constantFrom(...requiredFields),
        fc.constantFrom('', undefined, null),
        (rule, field, blankValue) => {
          const corrupted = { ...rule, [field]: blankValue } as unknown as Rule;
          expect(() => validateRules([corrupted])).toThrowError(new RegExp(`"${field}"`));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 3: Validation rejects duplicate IDs
describe('Property 3: Validation rejects duplicate IDs', () => {
  // **Validates: Requirements 2.3**

  /** Generates a rule guaranteed to pass validation (non-blank required fields) */
  const arbValidRule: fc.Arbitrary<Rule> = arbRule().map((rule) => ({
    ...rule,
    id: rule.id || 'valid-id',
    name: rule.name && rule.name.trim() ? rule.name : 'ValidName',
    description: rule.description && rule.description.trim() ? rule.description : 'ValidDescription',
    action: rule.action || 'filter',
  }));

  it('for any array of Rules with duplicate IDs, validateRules rejects and reports the duplicate', () => {
    fc.assert(
      fc.property(
        fc.array(arbValidRule, { minLength: 2, maxLength: 10 }),
        (rules) => {
          // Assign unique IDs to all rules first
          const deduped = rules.map((r, i) => ({ ...r, id: `rule-${i}` }));

          // Now force a duplicate: set the second rule's ID to match the first
          deduped[1] = { ...deduped[1], id: deduped[0].id };

          expect(() => validateRules(deduped)).toThrowError(new RegExp(deduped[0].id));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: meal-selection-rules-engine, Property 4: Invalid JSON produces parse error
describe('Property 4: Invalid JSON produces parse error', () => {
  // **Validates: Requirements 2.4**

  it('for any non-JSON string, parseRules produces an error including the file path', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (invalidJson, filePath) => {
          expect(() => parseRules(invalidJson, filePath)).toThrowError(new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        },
      ),
      { numRuns: 100 },
    );
  });
});
