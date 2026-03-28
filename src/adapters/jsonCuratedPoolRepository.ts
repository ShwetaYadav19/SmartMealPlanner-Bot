import * as fs from 'fs';
import * as path from 'path';
import type { CuratedPoolRepository } from '../core/ports';
import type { CuratedPool } from '../core/types';

/**
 * Loads curated pool JSON files from a directory.
 * Files are named: {cuisine}-{diet}-{style}.json
 * e.g. north_indian-veg-health.json
 *
 * Falls back to null if no curated pool exists for the given combo,
 * allowing the caller to use the default generateCandidateDishes path.
 */
export class JsonCuratedPoolRepository implements CuratedPoolRepository {
  private readonly pools: Map<string, CuratedPool> = new Map();

  constructor(dirPath?: string) {
    const lambdaRoot = process.env.LAMBDA_TASK_ROOT ?? '/var/task';
    const defaultDir = process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(lambdaRoot, 'data', 'curated-pools')
      : path.resolve(__dirname, '..', 'data', 'curated-pools');
    const resolved = dirPath ?? defaultDir;

    const stat = fs.statSync(resolved, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) return;

    const files = fs.readdirSync(resolved).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const key = file.replace('.json', '');
      try {
        const raw = fs.readFileSync(path.join(resolved, file), 'utf-8');
        const pool = JSON.parse(raw) as CuratedPool;
        this.pools.set(key, pool);
      } catch (err) {
        console.warn(`[CuratedPoolRepository] Failed to load ${file}:`, err);
      }
    }
  }

  getPool(cuisine: string, diet: string, style: string): CuratedPool | null {
    // Normalize diet: veg_with_eggs falls back to veg pool
    const normalizedDiet = diet === 'veg_with_eggs' ? 'veg' : diet;
    const key = `${cuisine}-${normalizedDiet}-${style}`;
    return this.pools.get(key) ?? null;
  }
}
