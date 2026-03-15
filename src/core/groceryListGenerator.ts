// Grocery list generation — zero imports from adapters, WhatsApp, or AWS modules
import type { Meal, ComposedMeal, GroceryItem } from './types';

/**
 * Aggregate all ingredients from the given meals into a deduplicated,
 * category-grouped grocery list.
 *
 * - Deduplicates by ingredient name (case-insensitive)
 * - When duplicates are found, combines quantities (comma-separated)
 * - Groups output by category, sorted alphabetically
 */
export function generateGroceryList(meals: (Meal | ComposedMeal)[]): GroceryItem[] {
  // Map keyed by lowercase ingredient name → { category, name, quantities[] }
  const itemMap = new Map<string, { name: string; category: string; quantities: string[] }>();

  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      const key = ingredient.name.toLowerCase();
      const existing = itemMap.get(key);

      if (existing) {
        existing.quantities.push(ingredient.quantity);
      } else {
        itemMap.set(key, {
          name: ingredient.name,
          category: ingredient.category,
          quantities: [ingredient.quantity],
        });
      }
    }
  }

  // Aggregate quantities: count occurrences of each unique quantity
  const items: GroceryItem[] = Array.from(itemMap.values()).map(({ name, category, quantities }) => {
    const countMap = new Map<string, number>();
    for (const q of quantities) {
      countMap.set(q, (countMap.get(q) ?? 0) + 1);
    }
    const parts: string[] = [];
    for (const [qty, count] of countMap) {
      parts.push(count > 1 ? `${qty} x${count}` : qty);
    }
    return { name, category, quantity: parts.join(', ') };
  });

  // Sort by category then by name for consistent output
  items.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });

  return items;
}
