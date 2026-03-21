import * as fs from 'fs';
import * as path from 'path';
import type { MealRepository } from '../core/ports';
import type { Meal, MealFilter } from '../core/types';

export class JsonMealRepository implements MealRepository {
  private meals: Meal[];

  constructor(mealsFilePath?: string) {
    const lambdaRoot = process.env.LAMBDA_TASK_ROOT ?? '/var/task';
    const defaultPath = process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(lambdaRoot, 'data', 'meals.json')
      : path.resolve(__dirname, '..', 'data', 'meals.json');
    const filePath = mealsFilePath ?? defaultPath;
    const raw = fs.readFileSync(filePath, 'utf-8');
    this.meals = JSON.parse(raw) as Meal[];
  }

  async getMeals(filter: MealFilter): Promise<Meal[]> {
    return this.meals.filter((meal) => {
      if (filter.cuisine) {
        if (filter.cuisine === 'both') {
          // 'both' = NI + crossover items — include anything tagged north_indian
          if (!meal.cuisine.includes('north_indian')) return false;
        } else {
          // Strict match: only include meals exclusively tagged with the selected cuisine.
          // Dual-tagged meals (e.g. ["south_indian","north_indian"]) are excluded
          // so a "North Indian" user doesn't see Dosa, Medu Vada, etc.
          if (meal.cuisine.length !== 1 || meal.cuisine[0] !== filter.cuisine) return false;
        }
      }

      if (filter.diet && filter.diet !== 'both') {
        if (meal.diet !== filter.diet) return false;
      }

      if (filter.style) {
        if (meal.style !== filter.style) return false;
      }

      if (filter.slot) {
        if (!meal.slots.includes(filter.slot)) return false;
      }

      return true;
    });
  }

  async getMealById(id: string): Promise<Meal | null> {
    return this.meals.find((meal) => meal.id === id) ?? null;
  }
}
