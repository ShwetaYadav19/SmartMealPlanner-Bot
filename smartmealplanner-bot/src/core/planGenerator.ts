// Plan generation — zero imports from adapters, WhatsApp, or AWS modules
import type { Meal, DayPlan, WeeklyPlan } from './types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type SlotName = 'breakfast' | 'lunch' | 'dinner';
const SLOTS: SlotName[] = ['breakfast', 'lunch', 'dinner'];

/**
 * Fisher-Yates (Knuth) in-place shuffle.
 */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Filter meals that are compatible with a given slot.
 */
function mealsForSlot(meals: Meal[], slot: SlotName): Meal[] {
  return meals.filter((m) => m.slots.includes(slot));
}

/**
 * Pick a meal from the pool using a rotating cursor, respecting:
 *  1. No repeat within the same day (across slots)
 *  2. No repeat in the same slot on the previous day
 *  3. When cuisine is "both", try to alternate cuisines
 *
 * The cursor advances through the shuffled pool so each day gets a
 * different starting point, producing much more variety across the week.
 */
/**
 * Extract the "key ingredients" from a meal — proteins and prominent vegetables
 * that shouldn't repeat within the same day.
 */
function getKeyIngredients(meal: Meal): Set<string> {
  const keys = new Set<string>();
  for (const ing of meal.ingredients) {
    const name = ing.name.toLowerCase();
    // Proteins
    if (name.includes('chicken') || name.includes('keema')) keys.add('chicken');
    if (name.includes('egg')) keys.add('egg');
    if (name.includes('fish')) keys.add('fish');
    if (name.includes('paneer')) keys.add('paneer');
    // Prominent vegetables (the star of the dish, not garnishes)
    if (name.includes('cauliflower') || name.includes('gobi')) keys.add('cauliflower');
    if (name.includes('spinach') || name.includes('palak') || name.includes('keerai')) keys.add('spinach');
    if (name.includes('okra') || name.includes('bhindi') || name.includes('vendakkai')) keys.add('okra');
    if (name.includes('bottle gourd') || name.includes('lauki')) keys.add('lauki');
    if (name.includes('ridge gourd') || name.includes('tori')) keys.add('ridge_gourd');
    if (name.includes('brinjal') || name.includes('eggplant') || name.includes('baingan')) keys.add('brinjal');
    if (name.includes('cabbage')) keys.add('cabbage');
    if (name.includes('drumstick')) keys.add('drumstick');
    if (name.includes('banana flower') || name.includes('vazhaipoo')) keys.add('banana_flower');
    if (name.includes('pointed gourd') || name.includes('parwal')) keys.add('parwal');
    if (name.includes('tinda')) keys.add('tinda');
    if (name.includes('ash gourd')) keys.add('ash_gourd');
    if (name.includes('raw banana')) keys.add('raw_banana');
  }
  return keys;
}

/**
 * Check if a meal shares any key ingredient with the set of ingredients
 * already used today.
 */
function hasKeyIngredientOverlap(meal: Meal, usedKeyIngredients: Set<string>): boolean {
  const mealKeys = getKeyIngredients(meal);
  for (const key of mealKeys) {
    if (usedKeyIngredients.has(key)) return true;
  }
  return false;
}

/**
 * Pick a meal from the pool using a rotating cursor, respecting:
 *  1. No repeat within the same day (across slots)
 *  2. No repeat in the same slot within a 3-day window
 *  3. No key ingredient (egg, chicken, same vegetable) repeated in the same day
 *  4. When cuisine is "both", try to alternate cuisines
 *
 * The cursor advances through the shuffled pool so each day gets a
 * different starting point, producing much more variety across the week.
 */
function pickMealFromCursor(
  pool: Meal[],
  cursor: Record<SlotName, number>,
  slot: SlotName,
  usedToday: Set<string>,
  recentSlotMealIds: Set<string>,
  preferredCuisine: 'north_indian' | 'south_indian' | null,
  usedKeyIngredients: Set<string>,
): Meal | null {
  const len = pool.length;
  if (len === 0) return null;

  const start = cursor[slot] % len;

  // First pass: honour cuisine preference + all constraints (3-day + ingredient)
  if (preferredCuisine) {
    for (let i = 0; i < len; i++) {
      const meal = pool[(start + i) % len];
      if (
        meal.cuisine === preferredCuisine &&
        !usedToday.has(meal.id) &&
        !recentSlotMealIds.has(meal.id) &&
        !hasKeyIngredientOverlap(meal, usedKeyIngredients)
      ) {
        cursor[slot] = (start + i + 1) % len;
        return meal;
      }
    }
  }

  // Second pass: any cuisine, all constraints (3-day + ingredient)
  for (let i = 0; i < len; i++) {
    const meal = pool[(start + i) % len];
    if (
      !usedToday.has(meal.id) &&
      !recentSlotMealIds.has(meal.id) &&
      !hasKeyIngredientOverlap(meal, usedKeyIngredients)
    ) {
      cursor[slot] = (start + i + 1) % len;
      return meal;
    }
  }

  // Third pass: relax ingredient constraint, keep 3-day slot constraint
  for (let i = 0; i < len; i++) {
    const meal = pool[(start + i) % len];
    if (!usedToday.has(meal.id) && !recentSlotMealIds.has(meal.id)) {
      cursor[slot] = (start + i + 1) % len;
      return meal;
    }
  }

  // Fourth pass: relax 3-day constraint, keep same-day uniqueness
  for (let i = 0; i < len; i++) {
    const meal = pool[(start + i) % len];
    if (!usedToday.has(meal.id)) {
      cursor[slot] = (start + i + 1) % len;
      return meal;
    }
  }

  // Last resort: return next meal in rotation
  const meal = pool[start];
  cursor[slot] = (start + 1) % len;
  return meal;
}

/**
 * For "both" cuisine, decide the preferred cuisine for each (day, slot) pair
 * to distribute North and South Indian meals across the plan.
 */
function buildCuisineSchedule(): Record<number, Record<SlotName, 'north_indian' | 'south_indian'>> {
  const schedule: Record<number, Record<SlotName, 'north_indian' | 'south_indian'>> = {};
  for (let d = 0; d < 7; d++) {
    schedule[d] = {} as Record<SlotName, 'north_indian' | 'south_indian'>;
    for (let s = 0; s < SLOTS.length; s++) {
      // Alternate based on (day + slot) parity for even distribution
      schedule[d][SLOTS[s]] = (d + s) % 2 === 0 ? 'north_indian' : 'south_indian';
    }
  }
  return schedule;
}

/**
 * Generate a 7-day weekly meal plan.
 *
 * @param meals - Pre-filtered meals matching user preferences (diet, style, cuisine).
 *                The function still groups by slot compatibility internally.
 * @param preferences - User preferences including cuisine, diet, style.
 * @returns A WeeklyPlan (array of 7 DayPlan objects, Monday–Sunday).
 */
export function generateWeeklyPlan(
  meals: Meal[],
  preferences: { cuisine: string; diet: string; style: string },
): WeeklyPlan {
  const isBoth = preferences.cuisine === 'both';

  // Group meals by slot and shuffle each pool
  const pools: Record<SlotName, Meal[]> = {
    breakfast: fisherYatesShuffle(mealsForSlot(meals, 'breakfast')),
    lunch: fisherYatesShuffle(mealsForSlot(meals, 'lunch')),
    dinner: fisherYatesShuffle(mealsForSlot(meals, 'dinner')),
  };

  // Track a rotating cursor per slot so we consume through the shuffled pool
  // instead of always scanning from index 0
  const cursor: Record<SlotName, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  };

  const cuisineSchedule = isBoth ? buildCuisineSchedule() : null;

  // Track recent meal ids per slot using a sliding 3-day window
  // Each slot keeps the ids used in the last 3 days to avoid repetition
  const recentSlotHistory: Record<SlotName, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };
  const RECENT_WINDOW = 3;

  const plan: WeeklyPlan = [];

  for (let d = 0; d < 7; d++) {
    const usedToday = new Set<string>();
    const usedKeyIngredients = new Set<string>();
    const dayMeals: Record<SlotName, Meal> = {} as Record<SlotName, Meal>;

    for (const slot of SLOTS) {
      const preferredCuisine = cuisineSchedule ? cuisineSchedule[d][slot] : null;
      const pool = pools[slot];

      // Build the set of recent meal ids for this slot (last 3 days)
      const recentSlotMealIds = new Set<string>(recentSlotHistory[slot]);

      const meal = pickMealFromCursor(
        pool,
        cursor,
        slot,
        usedToday,
        recentSlotMealIds,
        preferredCuisine,
        usedKeyIngredients,
      );

      if (!meal) {
        throw new Error(
          `Not enough meals available for ${slot} on ${DAYS[d]}. ` +
          `Need at least enough unique meals per slot to fill 7 days.`,
        );
      }

      dayMeals[slot] = meal;
      usedToday.add(meal.id);

      // Track key ingredients so the next slot in the same day avoids them
      for (const key of getKeyIngredients(meal)) {
        usedKeyIngredients.add(key);
      }
    }

    plan.push({
      day: DAYS[d],
      breakfast: dayMeals.breakfast,
      lunch: dayMeals.lunch,
      dinner: dayMeals.dinner,
    });

    // Update sliding window history per slot
    for (const slot of SLOTS) {
      recentSlotHistory[slot].push(dayMeals[slot].id);
      if (recentSlotHistory[slot].length > RECENT_WINDOW) {
        recentSlotHistory[slot].shift();
      }
    }
  }

  return plan;
}

/**
 * Extract tomorrow's plan from a weekly plan.
 *
 * @param weeklyPlan - A 7-element array of DayPlan (index 0=Monday through 6=Sunday).
 * @param weeklyPlanStartDate - ISO date string for the Monday the plan starts (e.g., "2024-01-15").
 * @returns The DayPlan for tomorrow, or null if the plan doesn't cover tomorrow.
 */
export function extractTomorrowPlan(
  weeklyPlan: WeeklyPlan,
  weeklyPlanStartDate: string,
): DayPlan | null {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const startDate = new Date(weeklyPlanStartDate + 'T00:00:00');
  const diffMs = tomorrow.getTime() - startDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0 || diffDays > 6) {
    return null;
  }

  return weeklyPlan[diffDays] ?? null;
}


/**
 * Swap tomorrow's lunch with a different meal from the pool.
 *
 * Constraints for the replacement:
 *  1. Must be compatible with the 'lunch' slot
 *  2. Must not be the same as the current lunch
 *  3. Must not duplicate breakfast or dinner on the same day
 *  4. Must not duplicate lunch on adjacent days (tomorrowIndex ± 1)
 *
 * @param weeklyPlan - The current 7-day plan (will NOT be mutated).
 * @param tomorrowIndex - Day index 0–6 (Monday–Sunday).
 * @param meals - Full filtered meal pool (already filtered by preferences).
 * @param preferences - User preferences (cuisine, diet, style).
 * @returns Object with cloned updated plan, old meal name, and new meal name — or null if no valid replacement exists.
 */
export function swapTomorrowLunch(
  weeklyPlan: WeeklyPlan,
  tomorrowIndex: number,
  meals: Meal[],
  preferences: { cuisine: string; diet: string; style: string },
): { updatedPlan: WeeklyPlan; oldMeal: string; newMeal: string } | null {
  if (tomorrowIndex < 0 || tomorrowIndex > 6 || !weeklyPlan[tomorrowIndex]) {
    return null;
  }

  const currentDay = weeklyPlan[tomorrowIndex];
  const currentLunch = currentDay.lunch;

  // Collect IDs that the replacement must NOT match
  const excludedIds = new Set<string>();

  // Exclude current lunch
  excludedIds.add(currentLunch.id);

  // Exclude same-day breakfast and dinner
  excludedIds.add(currentDay.breakfast.id);
  excludedIds.add(currentDay.dinner.id);

  // Exclude adjacent-day lunches
  if (tomorrowIndex > 0 && weeklyPlan[tomorrowIndex - 1]) {
    excludedIds.add(weeklyPlan[tomorrowIndex - 1].lunch.id);
  }
  if (tomorrowIndex < 6 && weeklyPlan[tomorrowIndex + 1]) {
    excludedIds.add(weeklyPlan[tomorrowIndex + 1].lunch.id);
  }

  // Filter candidates: must be lunch-compatible and not in excluded set
  const candidates = meals.filter(
    (m) => m.slots.includes('lunch') && !excludedIds.has(m.id),
  );

  if (candidates.length === 0) {
    return null;
  }

  // Pick a random candidate
  const replacement = candidates[Math.floor(Math.random() * candidates.length)];

  // Deep-clone the plan so we don't mutate the original
  const updatedPlan: WeeklyPlan = weeklyPlan.map((day) => ({
    ...day,
    breakfast: { ...day.breakfast },
    lunch: { ...day.lunch },
    dinner: { ...day.dinner },
  }));

  updatedPlan[tomorrowIndex].lunch = replacement;

  return {
    updatedPlan,
    oldMeal: currentLunch.name,
    newMeal: replacement.name,
  };
}

