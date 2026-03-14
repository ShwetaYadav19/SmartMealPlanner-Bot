import * as fs from 'fs';
import * as path from 'path';
import type { MealRepository } from '../core/ports';
import type { Meal, MealFilter } from '../core/types';

export class JsonMealRepository implements MealRepository {
  private meals: Meal[];

  constructor(mealsFilePath?: string) {
    const defaultPath = process.env.LAMBDA_TASK_ROOT
      ? path.join(process.env.LAMBDA_TASK_ROOT, 'data', 'meals.json')
      : path.resolve(__dirname, '..', 'data', 'meals.json');
    const filePath = mealsFilePath ?? defaultPath;
    const raw = fs.readFileSync(filePath, 'utf-8');
    this.meals = JSON.parse(raw) as Meal[];
  }

  async getMeals(filter: MealFilter): Promise<Meal[]> {
    return this.meals.filter((meal) => {
      if (filter.cuisine && filter.cuisine !== 'both') {
        if (meal.cuisine !== filter.cuisine) return false;
      }

      if (filter.diet) {
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
