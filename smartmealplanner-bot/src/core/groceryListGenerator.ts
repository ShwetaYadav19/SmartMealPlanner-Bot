// Grocery list generation — zero imports from adapters, WhatsApp, or AWS modules
import type { Meal, GroceryItem } from './types';

/**
 * Aggregate all ingredients from the given meals into a deduplicated,
 * category-grouped grocery list.
 *
 * - Deduplicates by ingredient name (case-insensitive)
 * - When duplicates are found, combines quantities (comma-separated)
 * - Groups output by category, sorted alphabetically
 */
export function generateGroceryList(meals: Meal[]): GroceryItem[] {
  // Map keyed by lowercase ingredient name → accumulated GroceryItem
  const itemMap = new Map<string, GroceryItem>();

  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      const key = ingredient.name.toLowerCase();
      const existing = itemMap.get(key);

      if (existing) {
        // Combine quantities if they differ
        if (existing.quantity !== ingredient.quantity) {
          existing.quantity = `${existing.quantity}, ${ingredient.quantity}`;
        }
      } else {
        itemMap.set(key, {
          name: ingredient.name,
          quantity: ingredient.quantity,
          category: ingredient.category,
        });
      }
    }
  }

  // Sort by category then by name for consistent output
  const items = Array.from(itemMap.values());
  items.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });

  return items;
}
