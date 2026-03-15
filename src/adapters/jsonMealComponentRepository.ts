import * as fs from 'fs';
import * as path from 'path';
import type { MealComponentRepository } from '../core/ports';
import type { MealComponent, MealComponentFilter } from '../core/types';

export class JsonMealComponentRepository implements MealComponentRepository {
  private components: MealComponent[];

  constructor(filePath?: string) {
    const lambdaRoot = process.env.LAMBDA_TASK_ROOT ?? '/var/task';
    const defaultPath = process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(lambdaRoot, 'data', 'meal-components.json')
      : path.resolve(__dirname, '..', 'data', 'meal-components.json');
    const resolvedPath = filePath ?? defaultPath;

    let raw: string;
    try {
      raw = fs.readFileSync(resolvedPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read meal components file at "${resolvedPath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    try {
      this.components = JSON.parse(raw) as MealComponent[];
    } catch (err) {
      throw new Error(
        `Failed to parse meal components JSON at "${resolvedPath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!Array.isArray(this.components)) {
      throw new Error(
        `Malformed meal components file at "${resolvedPath}": expected a JSON array`
      );
    }
  }

  async getComponents(filter: MealComponentFilter): Promise<MealComponent[]> {
    return this.components.filter((component) => {
      if (filter.cuisine && filter.cuisine !== 'both') {
        if (component.cuisine !== filter.cuisine) return false;
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
