import type { Rule, RuleAction, RuleScope, RuleEvaluationContext } from './types';

const VALID_ACTIONS: RuleAction[] = ['filter', 'prefer', 'constrain', 'limit'];
const VALID_SCOPES: RuleScope[] = ['breakfast', 'lunch_component', 'dinner_component', 'all_slots'];
const REQUIRED_FIELDS: (keyof Pick<Rule, 'id' | 'name' | 'description' | 'action'>)[] = [
  'id',
  'name',
  'description',
  'action',
];

/**
 * Validates an array of rules, throwing on the first error found.
 * Checks required fields, duplicate IDs, valid action types, and valid scope values.
 */
export function validateRules(rules: Rule[]): void {
  const seenIds = new Set<string>();

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    for (const field of REQUIRED_FIELDS) {
      const value = rule[field];
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`Rule at index ${i} is missing required field "${field}"`);
      }
    }

    if (seenIds.has(rule.id)) {
      throw new Error(`Duplicate rule ID "${rule.id}"`);
    }
    seenIds.add(rule.id);

    if (!VALID_ACTIONS.includes(rule.action)) {
      throw new Error(`Rule at index ${i} has unknown action type "${rule.action}"`);
    }

    if (!VALID_SCOPES.includes(rule.scope)) {
      throw new Error(`Rule at index ${i} has unknown scope value "${rule.scope}"`);
    }
  }
}

/**
 * Parses a JSON string into a typed Rule array.
 * Throws with the file path included in the message on invalid JSON.
 */
export function parseRules(json: string, filePath?: string): Rule[] {
  try {
    return JSON.parse(json) as Rule[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      filePath
        ? `Failed to parse rules file "${filePath}": ${message}`
        : `Failed to parse rules: ${message}`,
    );
  }
}

/**
 * Serializes a Rule array back to formatted JSON with 2-space indentation.
 */
export function serializeRules(rules: Rule[]): string {
  return JSON.stringify(rules, null, 2);
}

/**
 * Returns rules applicable to the given scope, preserving declaration order.
 * A rule applies if its scope matches the given scope or is 'all_slots'.
 */
export function getApplicableRules(
  rules: Rule[],
  scope: RuleScope,
  _context: RuleEvaluationContext,
): Rule[] {
  return rules.filter((rule) => rule.scope === scope || rule.scope === 'all_slots');
}
