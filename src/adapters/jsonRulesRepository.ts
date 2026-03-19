import * as fs from 'fs/promises';
import * as path from 'path';
import type { RulesRepository } from '../core/ports';
import type { Rule } from '../core/types';
import { parseRules, validateRules } from '../core/rulesEngine';

export class JsonRulesRepository implements RulesRepository {
  private cachedRules: Rule[] | null = null;
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), 'data', 'meal-selection-rules.json');
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
