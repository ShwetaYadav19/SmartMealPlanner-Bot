import * as fs from 'fs';
import * as path from 'path';
import type { MealComponentRepository } from '../core/ports';
import type { MealComponent, MealComponentFilter } from '../core/types';

export class JsonMealComponentRepository implements MealComponentRepository {
  private components: MealComponent[];

  constructor(pathOrDir?: string) {
    const lambdaRoot = process.env.LAMBDA_TASK_ROOT ?? '/var/task';
    const defaultDir = process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(lambdaRoot, 'data', 'meal-components')
      : path.resolve(__dirname, '..', 'data', 'meal-components');
    const resolved = pathOrDir ?? defaultDir;

    // Support both a single JSON file (backward compat) and a directory of per-category files
    const stat = fs.statSync(resolved, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      this.components = this.loadFromDirectory(resolved);
    } else {
      this.components = this.loadFromFile(resolved);
    }
  }

  private loadFromDirectory(dirPath: string): MealComponent[] {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json')).sort();
    const seen = new Set<string>();
    const all: MealComponent[] = [];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const items = this.loadFromFile(filePath);
      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      }
    }
    return all;
  }

  private loadFromFile(filePath: string): MealComponent[] {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read meal components file at "${filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let parsed: MealComponent[];
    try {
      parsed = JSON.parse(raw) as MealComponent[];
    } catch (err) {
      throw new Error(
        `Failed to parse meal components JSON at "${filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `Malformed meal components file at "${filePath}": expected a JSON array`
      );
    }
    return parsed;
  }

  async getComponents(filter: MealComponentFilter): Promise<MealComponent[]> {
    return this.components.filter((component) => {
      if (filter.cuisine) {
        if (filter.cuisine === 'both') {
          if (!component.cuisine.includes('north_indian')) return false;
        } else {
          if (!component.cuisine.includes(filter.cuisine)) return false;
        }
      }

      if (filter.diet && filter.diet !== 'both') {
        if (component.diet !== filter.diet) return false;
      }

      if (filter.style) {
        if (component.style !== filter.style) return false;
      }

      if (filter.slot) {
        if (!component.slots.includes(filter.slot)) return false;
      }

      if (filter.category) {
        if (component.category !== filter.category) return false;
      }

      return true;
    });
  }
}
