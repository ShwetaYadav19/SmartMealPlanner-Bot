import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { JsonRulesRepository } from '../../src/adapters/jsonRulesRepository';
import type { Rule } from '../../src/core/types';

const validRules: Rule[] = [
  {
    id: 'cuisine-filter',
    name: 'Cuisine Preference Filter',
    description: 'Only include meals matching the user cuisine preference.',
    scope: 'all_slots',
    action: 'filter',
    conditions: { preferenceField: 'cuisine' },
  },
  {
    id: 'diet-filter',
    name: 'Diet Preference Filter',
    description: 'Only include meals matching the user diet preference.',
    scope: 'all_slots',
    action: 'filter',
    conditions: { preferenceField: 'diet' },
  },
];

describe('JsonRulesRepository', () => {
  const tmpFiles: string[] = [];

  async function writeTmpFile(content: string): Promise<string> {
    const filePath = path.join(os.tmpdir(), `rules-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    await fs.writeFile(filePath, content, 'utf-8');
    tmpFiles.push(filePath);
    return filePath;
  }

  afterEach(async () => {
    for (const f of tmpFiles) {
      await fs.unlink(f).catch(() => {});
    }
    tmpFiles.length = 0;
  });

  it('loads and returns valid rules from a JSON file', async () => {
    const filePath = await writeTmpFile(JSON.stringify(validRules, null, 2));
    const repo = new JsonRulesRepository(filePath);

    const rules = await repo.getRules();

    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe('cuisine-filter');
    expect(rules[1].id).toBe('diet-filter');
    expect(rules[0].action).toBe('filter');
    expect(rules[0].scope).toBe('all_slots');
  });

  it('caches rules after the first load', async () => {
    const filePath = await writeTmpFile(JSON.stringify(validRules, null, 2));
    const repo = new JsonRulesRepository(filePath);

    const first = await repo.getRules();
    const second = await repo.getRules();

    expect(first).toBe(second); // same reference — cached
  });

  it('throws with the file path when the file does not exist', async () => {
    const missingPath = path.join(os.tmpdir(), 'nonexistent-rules-file.json');
    const repo = new JsonRulesRepository(missingPath);

    await expect(repo.getRules()).rejects.toThrow(missingPath);
  });

  it('throws with the file path when the file contains invalid JSON', async () => {
    const filePath = await writeTmpFile('{ not valid json !!!');
    const repo = new JsonRulesRepository(filePath);

    await expect(repo.getRules()).rejects.toThrow(filePath);
  });

  it('propagates validation errors for duplicate rule IDs', async () => {
    const duplicateRules: Rule[] = [
      { ...validRules[0] },
      { ...validRules[0] }, // same id
    ];
    const filePath = await writeTmpFile(JSON.stringify(duplicateRules, null, 2));
    const repo = new JsonRulesRepository(filePath);

    await expect(repo.getRules()).rejects.toThrow('Duplicate rule ID "cuisine-filter"');
  });
});
