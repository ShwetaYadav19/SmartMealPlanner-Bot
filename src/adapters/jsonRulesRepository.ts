import * as fs from 'fs/promises';
import * as path from 'path';
import type { RulesRepository } from '../core/ports';
import type { Rule } from '../core/types';
import { parseRules, validateRules } from '../core/rulesEngine';

export class JsonRulesRepository implements RulesRepository {
  private cachedRules: Rule[] | null = null;
  private readonly filePath: string;

  constructor(filePath?: string) {
    const lambdaRoot = process.env.LAMBDA_TASK_ROOT ?? '/var/task';
    const defaultPath = process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(lambdaRoot, 'data', 'meal-selection-rules.json')
      : path.resolve(__dirname, '..', 'data', 'meal-selection-rules.json');
    this.filePath = filePath ?? defaultPath;
  }

  async getRules(): Promise<Rule[]> {
    if (this.cachedRules) {
      return this.cachedRules;
    }

    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Rules file not found at "${this.filePath}"`);
    }

    const rules = parseRules(raw, this.filePath);
    validateRules(rules);

    this.cachedRules = rules;
    return rules;
  }
}
