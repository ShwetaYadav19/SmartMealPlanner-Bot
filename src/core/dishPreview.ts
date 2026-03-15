// Dish preview logic — candidate generation, removal/replacement, and plan building
// Zero imports from adapters, WhatsApp, Twilio, or AWS modules

import type { MealRepository, MealComponentRepository } from './ports';
import type {
  Meal,
  ComposedMeal,
  MealComponent,
  CandidateDishes,
  ComponentsByCategory,
  DayPlan,
  WeeklyPlan,
  ComponentCategory,
} from './types';
import { composeMeal, type ComposeMealConstraints } from './planGenerator';

export interface DishPreviewDeps {
  mealRepository: MealRepository;
  mealComponentRepository: MealComponentRepository;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * Fisher-Yates shuffle (non-mutating).
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Compose a single meal for a slot/cuisine using the component pool.
 * Wraps the existing composeMeal with empty constraints (no history tracking needed
 * for candidate generation — each candidate is independent).
 */
function composeOneMeal(
  components: MealComponent[],
  slot: 'lunch' | 'dinner',
  cuisine: 'north_indian' | 'south_indian',
  diet: string,
): ComposedMeal {
  const emptyConstraints: ComposeMealConstraints = {
    base:       { recentIds: new Set(), sameDayIds: new Set() },
    gravy:      { recentIds: new Set(), sameDayIds: new Set() },
    dry_veggie: { recentIds: new Set(), sameDayIds: new Set() },
    side:       { recentIds: new Set(), sameDayIds: new Set() },
  };
  return composeMeal(components, slot, cuisine, emptyConstraints, diet);
}

/**
 * Resolve the concrete cuisine value for a given day index when preference is 'both'.
 * Alternates between north_indian and south_indian for variety.
 */
function resolveCuisine(
  preference: string,
  dayIndex: number,
): 'north_indian' | 'south_indian' {
  if (preference === 'both') {
    return dayIndex % 2 === 0 ? 'north_indian' : 'south_indian';
  }
  return preference as 'north_indian' | 'south_indian';
}

/**
 * Get the unique ID for a ComposedMeal. Uses a composite of component IDs
 * so we can identify and compare composed meals.
 */
function getComposedMealId(meal: ComposedMeal): string {
  return meal.components.map(c => c.id).sort().join('|');
}

/**
 * Fetch components for a given slot and category, applying diet fallback
 * (non_veg users also get veg components) and style fallback (health users
 * get regular components with "(Regular)" suffix when health options < 2).
 */
async function fetchCategoryPool(
  deps: DishPreviewDeps,
  preferences: { cuisine: string; diet: string; style: string },
  slot: 'lunch' | 'dinner',
  category: ComponentCategory,
  excludedSet: Set<string>,
): Promise<MealComponent[]> {
  const cuisine = preferences.cuisine as 'north_indian' | 'south_indian' | 'both';
  const style = preferences.style as 'health' | 'regular';

  // --- Diet fallback: non_veg users also get veg components ---
  let allForCategory: MealComponent[];
  if (preferences.diet === 'non_veg') {
    const nonVegComponents = await deps.mealComponentRepository.getComponents({
      cuisine, style, slot, category, diet: 'non_veg',
    });
    const vegComponents = await deps.mealComponentRepository.getComponents({
      cuisine, style, slot, category, diet: 'veg',
    });
    allForCategory = [...nonVegComponents, ...vegComponents];
  } else {
    allForCategory = await deps.mealComponentRepository.getComponents({
      cuisine, diet: preferences.diet as 'veg' | 'non_veg' | 'both', style, slot, category,
    });
  }

  // --- Style fallback: health users get regular fallback when health < 2 ---
  if (style === 'health') {
    const afterExclusion = allForCategory.filter(c => !excludedSet.has(c.id));

    if (afterExclusion.length < 2) {
      // Fetch regular components for the same slot/category/cuisine/diet
      let regularComponents: MealComponent[];
      if (preferences.diet === 'non_veg') {
        const regNonVeg = await deps.mealComponentRepository.getComponents({
          cuisine, style: 'regular', slot, category, diet: 'non_veg',
        });
        const regVeg = await deps.mealComponentRepository.getComponents({
          cuisine, style: 'regular', slot, category, diet: 'veg',
        });
        regularComponents = [...regNonVeg, ...regVeg];
      } else {
        regularComponents = await deps.mealComponentRepository.getComponents({
          cuisine, diet: preferences.diet as 'veg' | 'non_veg' | 'both', style: 'regular', slot, category,
        });
      }

      const regularFallback = regularComponents
        .filter(c => !excludedSet.has(c.id))
        .map(c => ({ ...c, name: `${c.name} (Regular)` }));

      return [...afterExclusion, ...regularFallback];
    }

    return afterExclusion;
  }

  // Non-health style: just filter exclusions
  return allForCategory.filter(c => !excludedSet.has(c.id));
}

/**
 * Generate candidate dishes for preview, excluding any in the exclusion list.
 *
 * Produces breakfasts as Meal objects (unchanged) and component pools for
 * lunch and dinner grouped by category (base, gravy, dry_veggie, side).
 * Components are filtered by the user's cuisine, diet, and style preferences.
 * Diet fallback: non_veg users also receive veg components.
 * Style fallback: health users receive regular components (with "(Regular)"
 * suffix) when health options in a category are fewer than 2.
 */
export async function generateCandidateDishes(
  deps: DishPreviewDeps,
  preferences: { cuisine: string; diet: string; style: string },
  excludedDishIds: string[],
): Promise<CandidateDishes> {
  const excludedSet = new Set(excludedDishIds);

  // --- Breakfasts (unchanged) ---
  const allBreakfasts = await deps.mealRepository.getMeals({
    cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
    diet: preferences.diet as 'veg' | 'non_veg' | 'both',
    style: preferences.style as 'health' | 'regular',
    slot: 'breakfast',
  });
  const availableBreakfasts = allBreakfasts.filter(m => !excludedSet.has(m.id));
  const shuffledBreakfasts = shuffle(availableBreakfasts);

  const breakfasts: Meal[] = [];
  for (let i = 0; i < 7 && i < shuffledBreakfasts.length; i++) {
    breakfasts.push(shuffledBreakfasts[i]);
  }

  // --- Lunch & Dinner component pools ---
  const categories: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
  const slots: ('lunch' | 'dinner')[] = ['lunch', 'dinner'];

  const lunchComponents: ComponentsByCategory = { base: [], gravy: [], dry_veggie: [], side: [] };
  const dinnerComponents: ComponentsByCategory = { base: [], gravy: [], dry_veggie: [], side: [] };

  for (const slot of slots) {
    for (const category of categories) {
      const pool = await fetchCategoryPool(deps, preferences, slot, category, excludedSet);
      if (slot === 'lunch') {
        lunchComponents[category] = pool;
      } else {
        dinnerComponents[category] = pool;
      }
    }
  }

  return { breakfasts, lunchComponents, dinnerComponents };
}

/**
 * Remove a breakfast by meal ID and replace it with a new one from the pool.
 *
 * Extracted from the old removeDishAndReplace — handles breakfast removal only.
 * Finds a replacement breakfast from the available pool that is not excluded
 * and not already in the current candidates.
 *
 * Returns the updated candidates with the replacement, or null if no replacement
 * is available from the pool.
 */
export async function removeBreakfast(
  candidates: CandidateDishes,
  mealId: string,
  deps: DishPreviewDeps,
  preferences: { cuisine: string; diet: string; style: string },
  excludedDishIds: string[],
): Promise<{ updated: CandidateDishes; removedName: string; replacementName: string } | null> {
  const breakfastIdx = candidates.breakfasts.findIndex(m => m.id === mealId);
  if (breakfastIdx === -1) return null;

  const removed = candidates.breakfasts[breakfastIdx];
  const excludedSet = new Set([...excludedDishIds, mealId]);
  const existingIds = new Set(candidates.breakfasts.map(m => m.id));
  existingIds.delete(mealId);

  const allBreakfasts = await deps.mealRepository.getMeals({
    cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
    diet: preferences.diet as 'veg' | 'non_veg' | 'both',
    style: preferences.style as 'health' | 'regular',
    slot: 'breakfast',
  });

  const replacement = shuffle(allBreakfasts).find(
    m => !excludedSet.has(m.id) && !existingIds.has(m.id),
  );

  if (!replacement) return null;

  const updatedBreakfasts = [...candidates.breakfasts];
  updatedBreakfasts[breakfastIdx] = replacement;

  return {
    updated: { ...candidates, breakfasts: updatedBreakfasts },
    removedName: removed.name,
    replacementName: replacement.name,
  };
}


/**
 * Remove a component by ID from the lunch/dinner component pools.
 *
 * Pure function — searches all categories in lunchComponents and dinnerComponents
 * for the given component ID. If removing it would leave the category empty,
 * returns null (guard). Otherwise returns updated CandidateDishes with the
 * component filtered out, plus the removed component's name and category.
 */
export function removeComponent(
  candidates: CandidateDishes,
  componentId: string,
): { candidates: CandidateDishes; removedComponentName: string; removedComponentCategory: string } | null {
  const slots = ['lunchComponents', 'dinnerComponents'] as const;
  const categories: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];

  // First pass: find the component and check the empty-category guard in every slot
  let removedName: string | undefined;
  let removedCategory: ComponentCategory | undefined;

  for (const slot of slots) {
    for (const category of categories) {
      const components = candidates[slot][category];
      const idx = components.findIndex(c => c.id === componentId);
      if (idx !== -1) {
        // Guard: removing the last component in a category is not allowed
        if (components.length <= 1) {
          return null;
        }
        if (!removedName) {
          removedName = components[idx].name;
          removedCategory = category;
        }
      }
    }
  }

  if (!removedName || !removedCategory) {
    return null;
  }

  // Second pass: remove from all slots where it appears
  let updated = { ...candidates };
  for (const slot of slots) {
    for (const category of categories) {
      const components = updated[slot][category];
      if (components.some(c => c.id === componentId)) {
        updated = {
          ...updated,
          [slot]: {
            ...updated[slot],
            [category]: components.filter(c => c.id !== componentId),
          },
        };
      }
    }
  }

  return {
    candidates: updated,
    removedComponentName: removedName,
    removedComponentCategory: removedCategory,
  };
}


/**
 * Check if candidate dishes have at least one component per category in both
 * lunchComponents and dinnerComponents, and at least one breakfast.
 */
export function hasMinimumComponents(candidates: CandidateDishes): boolean {
  const { lunchComponents, dinnerComponents, breakfasts } = candidates;

  const allCategoriesFilled = (components: ComponentsByCategory): boolean =>
    components.base.length >= 1 &&
    components.gravy.length >= 1 &&
    components.dry_veggie.length >= 1 &&
    components.side.length >= 1;

  return (
    breakfasts.length >= 1 &&
    allCategoriesFilled(lunchComponents) &&
    allCategoriesFilled(dinnerComponents)
  );
}

/**
 * Convert confirmed candidate dishes into a WeeklyPlan.
 *
 * Maps candidates arrays by index to create 7 DayPlan entries with day names
 * (Monday through Sunday). If a slot has fewer than 7 items, the last item
 * is reused to fill remaining days.
 */
/**
 * Flatten a ComponentsByCategory into a single MealComponent array,
 * sorting health-style components before regular-style within each category.
 */
function flattenWithHealthFirst(components: ComponentsByCategory): MealComponent[] {
  const categories: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
  const result: MealComponent[] = [];
  for (const cat of categories) {
    const sorted = [...components[cat]].sort((a, b) => {
      if (a.style === 'health' && b.style !== 'health') return -1;
      if (a.style !== 'health' && b.style === 'health') return 1;
      return 0;
    });
    result.push(...sorted);
  }
  return result;
}

/**
 * Build a WeeklyPlan from confirmed component pools.
 *
 * For each of 7 days, composes lunch and dinner by calling composeMeal with
 * the component pools. Health-style components are sorted first in each
 * category to prioritize them during composition. Sliding-window history
 * and same-day dedup constraints are tracked across days.
 * Breakfasts are wrapped with reuse if fewer than 7.
 */
export function buildPlanFromComponents(
  candidates: CandidateDishes,
  preferences: { cuisine: string; diet: string },
): WeeklyPlan {
  const plan: WeeklyPlan = [];

  const lunchPool = flattenWithHealthFirst(candidates.lunchComponents);
  const dinnerPool = flattenWithHealthFirst(candidates.dinnerComponents);

  // Sliding-window history (recent 2 days) per category per slot
  const WINDOW = 2;
  const lunchHistory: Record<ComponentCategory, string[][]> = {
    base: [], gravy: [], dry_veggie: [], side: [],
  };
  const dinnerHistory: Record<ComponentCategory, string[][]> = {
    base: [], gravy: [], dry_veggie: [], side: [],
  };

  for (let i = 0; i < 7; i++) {
    // Resolve cuisine for this day
    const cuisine = resolveCuisine(preferences.cuisine, i);

    // Build constraints for lunch from history
    const lunchConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set<string>(), sameDayIds: new Set<string>() },
      gravy:      { recentIds: new Set<string>(), sameDayIds: new Set<string>() },
      dry_veggie: { recentIds: new Set<string>(), sameDayIds: new Set<string>() },
      side:       { recentIds: new Set<string>(), sameDayIds: new Set<string>() },
    };
    const categories: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
    for (const cat of categories) {
      // Recent IDs from sliding window
      const recentDays = lunchHistory[cat].slice(-WINDOW);
      for (const dayIds of recentDays) {
        for (const id of dayIds) {
          lunchConstraints[cat].recentIds.add(id);
        }
      }
    }

    const lunch = composeMeal(lunchPool, 'lunch', cuisine, lunchConstraints, preferences.diet);

    // Record lunch picks in history
    for (const comp of lunch.components) {
      if (!lunchHistory[comp.category]) continue;
      const daySlot = lunchHistory[comp.category];
      if (daySlot.length <= i) daySlot.push([]);
      daySlot[i] = daySlot[i] || [];
      daySlot[i].push(comp.id);
    }

    // Build constraints for dinner — same-day dedup from lunch picks
    const sameDayLunchIds: Record<ComponentCategory, Set<string>> = {
      base: new Set<string>(), gravy: new Set<string>(), dry_veggie: new Set<string>(), side: new Set<string>(),
    };
    for (const comp of lunch.components) {
      sameDayLunchIds[comp.category].add(comp.id);
    }

    const dinnerConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set<string>(), sameDayIds: sameDayLunchIds.base },
      gravy:      { recentIds: new Set<string>(), sameDayIds: sameDayLunchIds.gravy },
      dry_veggie: { recentIds: new Set<string>(), sameDayIds: sameDayLunchIds.dry_veggie },
      side:       { recentIds: new Set<string>(), sameDayIds: sameDayLunchIds.side },
    };
    for (const cat of categories) {
      const recentDays = dinnerHistory[cat].slice(-WINDOW);
      for (const dayIds of recentDays) {
        for (const id of dayIds) {
          dinnerConstraints[cat].recentIds.add(id);
        }
      }
    }

    const dinner = composeMeal(dinnerPool, 'dinner', cuisine, dinnerConstraints, preferences.diet);

    // Record dinner picks in history
    for (const comp of dinner.components) {
      if (!dinnerHistory[comp.category]) continue;
      const daySlot = dinnerHistory[comp.category];
      if (daySlot.length <= i) daySlot.push([]);
      daySlot[i] = daySlot[i] || [];
      daySlot[i].push(comp.id);
    }

    // Wrap breakfasts with reuse
    const breakfast = candidates.breakfasts[i % candidates.breakfasts.length];

    plan.push({
      day: DAYS[i],
      breakfast,
      lunch,
      dinner,
    });
  }

  return plan;
}
