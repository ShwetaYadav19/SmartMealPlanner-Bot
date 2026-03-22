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
  RuleEvaluationContext,
} from './types';
import { composeMeal, type ComposeMealConstraints } from './planGenerator';
import type { MealSelector } from './mealSelector';

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
    // "both" means NI + crossover items — always use north_indian filter
    // which includes pure NI and dual-tagged crossover items
    return 'north_indian';
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
      cuisine, diet: preferences.diet as 'veg' | 'non_veg' | 'veg_with_eggs', style, slot, category,
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
          cuisine, diet: preferences.diet as 'veg' | 'non_veg' | 'veg_with_eggs', style: 'regular', slot, category,
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
  const result = allForCategory.filter(c => !excludedSet.has(c.id));
  if (result.length === 0) {
    console.warn('[fetchCategoryPool] EMPTY pool for %s/%s/%s (cuisine=%s, diet=%s, style=%s)',
      slot, category, preferences.style, preferences.cuisine, preferences.diet, style);
  }
  return result;
}

/**
 * Group a flat array of MealComponents into ComponentsByCategory.
 * Filters by the given slot before grouping.
 */
function groupByCategory(
  components: MealComponent[],
  slot: 'lunch' | 'dinner',
): ComponentsByCategory {
  const result: ComponentsByCategory = { base: [], gravy: [], dry_veggie: [], side: [] };
  for (const c of components) {
    if (c.slots.includes(slot) && result[c.category]) {
      result[c.category].push(c);
    }
  }
  return result;
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
 *
 * When a MealSelector is provided, rule-based candidate pool generation is
 * used instead of the inline fetchCategoryPool logic. The MealSelector's
 * getCandidatePool method applies all filter rules (cuisine, diet, diet-fallback,
 * style, style-fallback, excluded-dishes, south-indian-crossover) based on the
 * rules from the repository.
 */
export async function generateCandidateDishes(
  deps: DishPreviewDeps,
  preferences: { cuisine: string; diet: string; style: string },
  excludedDishIds: string[],
  mealSelector?: MealSelector,
): Promise<CandidateDishes> {
  // When MealSelector is provided, delegate to rule-based candidate pool generation
  if (mealSelector) {
    return generateCandidateDishesWithSelector(preferences, excludedDishIds, mealSelector);
  }

  const excludedSet = new Set(excludedDishIds);

  // --- Breakfasts (unchanged) ---
  const allBreakfasts = await deps.mealRepository.getMeals({
    cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
    diet: preferences.diet as 'veg' | 'non_veg' | 'veg_with_eggs',
    style: preferences.style as 'health' | 'regular',
    slot: 'breakfast',
  });
  const availableBreakfasts = allBreakfasts.filter(m => !excludedSet.has(m.id));
  const shuffledBreakfasts = shuffle(availableBreakfasts);

  const breakfasts: Meal[] = [];
  for (let i = 0; i < 7 && i < shuffledBreakfasts.length; i++) {
    breakfasts.push(shuffledBreakfasts[i]);
  }
  console.log('[generateCandidateDishes] breakfasts: all=%d, afterExclude=%d, picked=%d',
    allBreakfasts.length, availableBreakfasts.length, breakfasts.length);

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
 * Generate candidate dishes using MealSelector's rule-based filtering.
 *
 * Builds a RuleEvaluationContext for each slot (breakfast, lunch, dinner),
 * calls getCandidatePool to get filtered meals/components, and groups
 * the flat component arrays into ComponentsByCategory format.
 */
async function generateCandidateDishesWithSelector(
  preferences: { cuisine: string; diet: string; style: string },
  excludedDishIds: string[],
  mealSelector: MealSelector,
): Promise<CandidateDishes> {
  const baseContext: Omit<RuleEvaluationContext, 'slot'> = {
    userPreferences: {
      cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
      diet: preferences.diet as 'veg' | 'non_veg' | 'veg_with_eggs',
      style: preferences.style as 'health' | 'regular',
    },
    excludedDishIds,
    dayIndex: 0,
    history: {},
    sameDaySelections: {},
  };

  // --- Breakfasts via MealSelector ---
  const breakfastContext: RuleEvaluationContext = { ...baseContext, slot: 'breakfast' };
  const breakfastPool = await mealSelector.getCandidatePool(breakfastContext);
  const shuffledBreakfasts = shuffle(breakfastPool.meals);
  const breakfasts: Meal[] = shuffledBreakfasts.slice(0, 7);

  // --- Lunch components via MealSelector ---
  const lunchContext: RuleEvaluationContext = { ...baseContext, slot: 'lunch' };
  const lunchPool = await mealSelector.getCandidatePool(lunchContext);
  const lunchComponents = groupByCategory(lunchPool.components, 'lunch');

  // --- Dinner components via MealSelector ---
  const dinnerContext: RuleEvaluationContext = { ...baseContext, slot: 'dinner' };
  const dinnerPool = await mealSelector.getCandidatePool(dinnerContext);
  const dinnerComponents = groupByCategory(dinnerPool.components, 'dinner');

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
    diet: preferences.diet as 'veg' | 'non_veg' | 'veg_with_eggs',
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

  // First pass: find the component and determine which slots it can be safely removed from
  let removedName: string | undefined;
  let removedCategory: ComponentCategory | undefined;
  let canRemoveFromAny = false;

  // Track which slot+category pairs are safe to remove from
  const removable: Array<{ slot: typeof slots[number]; category: ComponentCategory }> = [];

  for (const slot of slots) {
    for (const category of categories) {
      const components = candidates[slot][category];
      const idx = components.findIndex(c => c.id === componentId);
      if (idx !== -1) {
        if (!removedName) {
          removedName = components[idx].name;
          removedCategory = category;
        }
        // Only remove from this slot if it won't leave the category empty
        if (components.length > 1) {
          removable.push({ slot, category });
          canRemoveFromAny = true;
        }
      }
    }
  }

  if (!removedName || !removedCategory || !canRemoveFromAny) {
    return null;
  }

  // Second pass: remove only from slots where it's safe
  let updated = { ...candidates };
  for (const { slot, category } of removable) {
    const components = updated[slot][category];
    updated = {
      ...updated,
      [slot]: {
        ...updated[slot],
        [category]: components.filter(c => c.id !== componentId),
      },
    };
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
  if (candidates.breakfasts.length === 0) {
    console.error('[buildPlanFromComponents] EMPTY breakfasts pool — cannot build plan. preferences:', JSON.stringify(preferences));
    throw new Error('No breakfast options available for the selected preferences');
  }
  console.log('[buildPlanFromComponents] building plan: breakfasts=%d, lunchPool=%d, dinnerPool=%d, prefs=%s',
    candidates.breakfasts.length,
    Object.values(candidates.lunchComponents).reduce((s, a) => s + a.length, 0),
    Object.values(candidates.dinnerComponents).reduce((s, a) => s + a.length, 0),
    JSON.stringify(preferences),
  );
  const plan: WeeklyPlan = [];

  const lunchPool = flattenWithHealthFirst(candidates.lunchComponents);
  const dinnerPool = flattenWithHealthFirst(candidates.dinnerComponents);

  // Cumulative used IDs per category per slot (no eviction — full used set)
  const categories: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
  const lunchHistory: Record<ComponentCategory, string[]> = {
    base: [], gravy: [], dry_veggie: [], side: [],
  };
  const dinnerHistory: Record<ComponentCategory, string[]> = {
    base: [], gravy: [], dry_veggie: [], side: [],
  };

  // Compute pool sizes per category-slot for pool-exhaustion reset
  const poolSizes = new Map<string, number>();
  for (const cat of categories) {
    poolSizes.set(`${cat}-lunch`, candidates.lunchComponents[cat].length);
    poolSizes.set(`${cat}-dinner`, candidates.dinnerComponents[cat].length);
  }

  for (let i = 0; i < 7; i++) {
    // Pool-exhaustion reset: if all items in a category-slot pool have been used,
    // clear the used set so the cycle can restart.
    for (const cat of categories) {
      const lunchSize = poolSizes.get(`${cat}-lunch`) ?? 0;
      if (lunchSize > 0 && lunchHistory[cat].length >= lunchSize) {
        lunchHistory[cat] = [];
      }
      const dinnerSize = poolSizes.get(`${cat}-dinner`) ?? 0;
      if (dinnerSize > 0 && dinnerHistory[cat].length >= dinnerSize) {
        dinnerHistory[cat] = [];
      }
    }

    // Resolve cuisine for this day
    const cuisine = resolveCuisine(preferences.cuisine, i);

    // Build constraints for lunch from cumulative used sets
    const lunchConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set<string>(lunchHistory.base),       sameDayIds: new Set<string>() },
      gravy:      { recentIds: new Set<string>(lunchHistory.gravy),      sameDayIds: new Set<string>() },
      dry_veggie: { recentIds: new Set<string>(lunchHistory.dry_veggie), sameDayIds: new Set<string>() },
      side:       { recentIds: new Set<string>(lunchHistory.side),       sameDayIds: new Set<string>() },
    };

    const lunch = composeMeal(lunchPool, 'lunch', cuisine, lunchConstraints, preferences.diet);

    // Record lunch picks in cumulative history
    for (const comp of lunch.components) {
      if (lunchHistory[comp.category]) {
        lunchHistory[comp.category].push(comp.id);
      }
    }

    // Build constraints for dinner — same-day dedup for base, gravy, and dry_veggie
    // Sides (small pool) are allowed to repeat same day
    const sameDayLunchIds: Record<ComponentCategory, Set<string>> = {
      base: new Set<string>(), gravy: new Set<string>(), dry_veggie: new Set<string>(), side: new Set<string>(),
    };
    for (const comp of lunch.components) {
      if (comp.category === 'base' || comp.category === 'gravy' || comp.category === 'dry_veggie') {
        sameDayLunchIds[comp.category].add(comp.id);
      }
    }

    const dinnerConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set<string>(dinnerHistory.base),       sameDayIds: sameDayLunchIds.base },
      gravy:      { recentIds: new Set<string>(dinnerHistory.gravy),      sameDayIds: sameDayLunchIds.gravy },
      dry_veggie: { recentIds: new Set<string>(dinnerHistory.dry_veggie), sameDayIds: sameDayLunchIds.dry_veggie },
      side:       { recentIds: new Set<string>(dinnerHistory.side),       sameDayIds: new Set<string>() },
    };

    const dinner = composeMeal(dinnerPool, 'dinner', cuisine, dinnerConstraints, preferences.diet,
      undefined, undefined, undefined,
      lunch.components.filter(c => c.category === 'gravy' || c.category === 'dry_veggie'),
    );

    // Record dinner picks in cumulative history
    for (const comp of dinner.components) {
      if (dinnerHistory[comp.category]) {
        dinnerHistory[comp.category].push(comp.id);
      }
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
