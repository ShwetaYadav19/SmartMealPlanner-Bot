// Plan generation — zero imports from adapters, WhatsApp, or AWS modules
import type { Meal, DayPlan, WeeklyPlan, MealComponent, ComposedMeal, ComponentCategory } from './types';

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
 * Extract ingredient names from a MealComponent as a lowercase set.
 */
function getComponentIngredientNames(component: MealComponent): Set<string> {
  return new Set(component.ingredients.map((ing) => ing.name.toLowerCase()));
}

/**
 * Check if two components share any ingredient name (case-insensitive).
 */
function hasIngredientOverlap(a: MealComponent, b: MealComponent): boolean {
  const namesA = getComponentIngredientNames(a);
  for (const name of getComponentIngredientNames(b)) {
    if (namesA.has(name)) return true;
  }
  return false;
}

/**
 * Pick a random element from an array.
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Compose a meal for a given slot and cuisine from a pool of MealComponents.
 *
 * Selects one base (random), one gravy (with variety constraints), one dry_veggie
 * (with variety constraints), and one side (random). Assembles them into a ComposedMeal.
 *
 * Gravy selection constraints (applied in order, progressively relaxed on failure):
 *  1. Not in usedGravyIds (3-day sliding window), not in usedSameDayGravyIds,
 *     no key-ingredient overlap with selected base
 *  2. Relax key-ingredient overlap
 *  3. Relax 3-day sliding window
 *  4. Relax same-day uniqueness
 *
 * Dry veggie selection constraints (applied in order, progressively relaxed on failure):
 *  1. Not in usedDryVeggieIds (3-day sliding window),
 *     no key-ingredient overlap with selected gravy
 *  2. Relax key-ingredient overlap
 *  3. Relax 3-day sliding window
 *
 * @param components - Pre-filtered component pool (already filtered by diet, style, etc.)
 * @param slot - Target slot ('lunch' or 'dinner')
 * @param cuisine - Target cuisine for this meal
 * @param usedGravyIds - Gravy IDs used in the 3-day sliding window for this slot
 * @param usedDryVeggieIds - Dry veggie IDs used in the 3-day sliding window for this slot
 * @param usedSameDayGravyIds - Gravy IDs already used on the same day (other slot)
 * @param usedSameDayBaseIds - Base IDs already used on the same day (other slot)
 * @returns A ComposedMeal with one component per category
 */
/**
 * Tracking sets passed into composeMeal for variety enforcement.
 *
 * For each category:
 *  - `recentIds`  — IDs seen in the sliding window (last N days for this slot)
 *  - `sameDayIds` — IDs already used in the other slot on the same day
 */
export interface ComposeMealConstraints {
  base:      { recentIds: Set<string>; sameDayIds: Set<string> };
  gravy:     { recentIds: Set<string>; sameDayIds: Set<string> };
  dry_veggie:{ recentIds: Set<string>; sameDayIds: Set<string> };
  side:      { recentIds: Set<string>; sameDayIds: Set<string> };
}

/**
 * Pick a component from `candidates` respecting constraints, with progressive relaxation.
 *
 * Relaxation order:
 *  1. Not in recentIds AND not in sameDayIds AND no ingredient overlap with `overlapRef`
 *  2. Relax ingredient overlap
 *  3. Relax recentIds (sliding window)
 *  4. Relax sameDayIds (last resort)
 */
function pickComponent(
  candidates: MealComponent[],
  recentIds: Set<string>,
  sameDayIds: Set<string>,
  overlapRef: MealComponent | null,
): MealComponent {
  const shuffled = fisherYatesShuffle(candidates);

  // Pass 1: all constraints
  for (const c of shuffled) {
    if (
      !recentIds.has(c.id) &&
      !sameDayIds.has(c.id) &&
      (!overlapRef || !hasIngredientOverlap(c, overlapRef))
    ) return c;
  }
  // Pass 2: relax ingredient overlap
  for (const c of shuffled) {
    if (!recentIds.has(c.id) && !sameDayIds.has(c.id)) return c;
  }
  // Pass 3: relax sliding window
  for (const c of shuffled) {
    if (!sameDayIds.has(c.id)) return c;
  }
  // Pass 4: last resort
  return shuffled[0];
}

/**
 * Compose a meal for a given slot and cuisine from a pool of MealComponents.
 *
 * Selects one base, one gravy, one dry_veggie, and one side. Each pick
 * respects same-day uniqueness, a sliding-window history, and (for gravy
 * and dry_veggie) key-ingredient overlap avoidance — all with progressive
 * constraint relaxation.
 */
export function composeMeal(
  components: MealComponent[],
  slot: 'lunch' | 'dinner',
  cuisine: 'north_indian' | 'south_indian',
  constraints: ComposeMealConstraints,
): ComposedMeal {
  // Filter by slot and cuisine
  const pool = components.filter(
    (c) => c.slots.includes(slot) && c.cuisine === cuisine,
  );

  // Group by category
  const byCategory: Record<ComponentCategory, MealComponent[]> = {
    base: [],
    gravy: [],
    dry_veggie: [],
    side: [],
  };
  for (const c of pool) {
    byCategory[c.category].push(c);
  }

  // Validate each category has at least one component
  for (const cat of ['base', 'gravy', 'dry_veggie', 'side'] as ComponentCategory[]) {
    if (byCategory[cat].length === 0) {
      throw new Error(
        `Not enough ${cat} components for ${cuisine}/${slot} to compose a meal`,
      );
    }
  }

  // 1. Pick base (no ingredient-overlap ref)
  const base = pickComponent(
    byCategory.base,
    constraints.base.recentIds,
    constraints.base.sameDayIds,
    null,
  );

  // 2. Pick gravy (avoid ingredient overlap with base)
  const gravy = pickComponent(
    byCategory.gravy,
    constraints.gravy.recentIds,
    constraints.gravy.sameDayIds,
    base,
  );

  // 3. Pick dry_veggie (avoid ingredient overlap with gravy)
  const dryVeggie = pickComponent(
    byCategory.dry_veggie,
    constraints.dry_veggie.recentIds,
    constraints.dry_veggie.sameDayIds,
    gravy,
  );

  // 4. Pick side (no ingredient-overlap ref)
  const side = pickComponent(
    byCategory.side,
    constraints.side.recentIds,
    constraints.side.sameDayIds,
    null,
  );

  // 5. Assemble ComposedMeal
  const mealComponents = [base, gravy, dryVeggie, side];
  return {
    components: mealComponents,
    name: mealComponents.map((c) => c.name).join(', '),
    ingredients: mealComponents.flatMap((c) => c.ingredients),
  };
}

/**
 * Generate a 7-day weekly meal plan.
 *
 * @param meals - Pre-filtered meals matching user preferences (diet, style, cuisine).
 *                Used for breakfast selection only.
 * @param components - Pre-filtered MealComponents matching user preferences.
 *                     Used for composing lunch and dinner.
 * @param preferences - User preferences including cuisine, diet, style.
 * @returns A WeeklyPlan (array of 7 DayPlan objects, Monday–Sunday).
 */
export function generateWeeklyPlan(
  meals: Meal[],
  components: MealComponent[],
  preferences: { cuisine: string; diet: string; style: string },
): WeeklyPlan {
  const isBothCuisine = preferences.cuisine === 'both';
  const isBothDiet = preferences.diet === 'both';

  // When diet is 'both', split meals into veg and non-veg pools per slot
  // and assign one non-veg slot per day (rotating through slots)
  const vegMeals = isBothDiet ? meals.filter(m => m.diet === 'veg') : meals;
  const nonVegMeals = isBothDiet ? meals.filter(m => m.diet === 'non_veg') : [];

  // Group meals by slot and shuffle each pool (breakfast only now)
  const pools: Record<SlotName, Meal[]> = {
    breakfast: fisherYatesShuffle(mealsForSlot(isBothDiet ? vegMeals : meals, 'breakfast')),
    lunch: fisherYatesShuffle(mealsForSlot(isBothDiet ? vegMeals : meals, 'lunch')),
    dinner: fisherYatesShuffle(mealsForSlot(isBothDiet ? vegMeals : meals, 'dinner')),
  };

  // Non-veg pools (only used when diet is 'both')
  const nonVegPools: Record<SlotName, Meal[]> = {
    breakfast: fisherYatesShuffle(mealsForSlot(nonVegMeals, 'breakfast')),
    lunch: fisherYatesShuffle(mealsForSlot(nonVegMeals, 'lunch')),
    dinner: fisherYatesShuffle(mealsForSlot(nonVegMeals, 'dinner')),
  };

  // Track a rotating cursor per slot so we consume through the shuffled pool
  const cursor: Record<SlotName, number> = { breakfast: 0, lunch: 0, dinner: 0 };
  const nonVegCursor: Record<SlotName, number> = { breakfast: 0, lunch: 0, dinner: 0 };

  const cuisineSchedule = isBothCuisine ? buildCuisineSchedule() : null;

  // Track recent meal ids per slot using a sliding 3-day window (for breakfast)
  const recentSlotHistory: Record<SlotName, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };
  const RECENT_WINDOW = 3;

  // Track sliding-window history per slot per category (last RECENT_WINDOW days)
  const CATEGORIES: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
  const history: Record<'lunch' | 'dinner', Record<ComponentCategory, string[]>> = {
    lunch:  { base: [], gravy: [], dry_veggie: [], side: [] },
    dinner: { base: [], gravy: [], dry_veggie: [], side: [] },
  };

  const plan: WeeklyPlan = [];

  for (let d = 0; d < 7; d++) {
    const usedToday = new Set<string>();
    const usedKeyIngredients = new Set<string>();

    // When diet is 'both', assign one non-veg slot per day (rotating)
    const nonVegSlot: SlotName | null = isBothDiet ? SLOTS[d % 3] : null;

    // --- Breakfast (unchanged logic using pickMealFromCursor) ---
    const breakfastSlot: SlotName = 'breakfast';
    const breakfastPreferredCuisine = cuisineSchedule ? cuisineSchedule[d][breakfastSlot] : null;
    const isBreakfastNonVeg = breakfastSlot === nonVegSlot;
    const breakfastPool = isBreakfastNonVeg ? nonVegPools[breakfastSlot] : pools[breakfastSlot];
    const breakfastCursorMap = isBreakfastNonVeg ? nonVegCursor : cursor;
    const breakfastRecentIds = new Set<string>(recentSlotHistory[breakfastSlot]);

    let breakfast = pickMealFromCursor(
      breakfastPool,
      breakfastCursorMap,
      breakfastSlot,
      usedToday,
      breakfastRecentIds,
      breakfastPreferredCuisine,
      usedKeyIngredients,
    );

    if (!breakfast) {
      if (isBreakfastNonVeg) {
        breakfast = pickMealFromCursor(
          pools[breakfastSlot],
          cursor,
          breakfastSlot,
          usedToday,
          breakfastRecentIds,
          breakfastPreferredCuisine,
          usedKeyIngredients,
        );
      }
      if (!breakfast) {
        throw new Error(
          `Not enough meals available for breakfast on ${DAYS[d]}. ` +
          `Need at least enough unique meals per slot to fill 7 days.`,
        );
      }
    }

    usedToday.add(breakfast.id);
    for (const key of getKeyIngredients(breakfast)) {
      usedKeyIngredients.add(key);
    }

    // --- Lunch (composed from components) ---
    const lunchCuisine: 'north_indian' | 'south_indian' = cuisineSchedule
      ? cuisineSchedule[d]['lunch']
      : (preferences.cuisine as 'north_indian' | 'south_indian');

    // Build lunch constraints — no same-day IDs yet (lunch is first)
    const lunchConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set(history.lunch.base),       sameDayIds: new Set() },
      gravy:      { recentIds: new Set(history.lunch.gravy),      sameDayIds: new Set() },
      dry_veggie: { recentIds: new Set(history.lunch.dry_veggie), sameDayIds: new Set() },
      side:       { recentIds: new Set(history.lunch.side),       sameDayIds: new Set() },
    };

    const lunch = composeMeal(components, 'lunch', lunchCuisine, lunchConstraints);

    // Collect lunch component IDs for same-day dedup
    const lunchIds: Record<ComponentCategory, string | undefined> = {
      base: undefined, gravy: undefined, dry_veggie: undefined, side: undefined,
    };
    for (const c of lunch.components) {
      lunchIds[c.category] = c.id;
    }

    // --- Dinner (composed from components) ---
    const dinnerCuisine: 'north_indian' | 'south_indian' = cuisineSchedule
      ? cuisineSchedule[d]['dinner']
      : (preferences.cuisine as 'north_indian' | 'south_indian');

    // Build dinner constraints — same-day IDs come from lunch
    const dinnerConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set(history.dinner.base),       sameDayIds: new Set(lunchIds.base       ? [lunchIds.base]       : []) },
      gravy:      { recentIds: new Set(history.dinner.gravy),      sameDayIds: new Set(lunchIds.gravy      ? [lunchIds.gravy]      : []) },
      dry_veggie: { recentIds: new Set(history.dinner.dry_veggie), sameDayIds: new Set(lunchIds.dry_veggie ? [lunchIds.dry_veggie] : []) },
      side:       { recentIds: new Set(history.dinner.side),       sameDayIds: new Set(lunchIds.side       ? [lunchIds.side]       : []) },
    };

    const dinner = composeMeal(components, 'dinner', dinnerCuisine, dinnerConstraints);

    plan.push({ day: DAYS[d], breakfast, lunch, dinner });

    // Update breakfast sliding window
    recentSlotHistory.breakfast.push(breakfast.id);
    if (recentSlotHistory.breakfast.length > RECENT_WINDOW) {
      recentSlotHistory.breakfast.shift();
    }

    // Update per-category sliding windows for lunch and dinner
    for (const slot of ['lunch', 'dinner'] as const) {
      const meal = slot === 'lunch' ? lunch : dinner;
      for (const cat of CATEGORIES) {
        const comp = meal.components.find(c => c.category === cat);
        if (comp) {
          history[slot][cat].push(comp.id);
          if (history[slot][cat].length > RECENT_WINDOW) {
            history[slot][cat].shift();
          }
        }
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
 * Swap tomorrow's lunch with a different composed meal.
 *
 * Constraints for the replacement:
 *  1. Must be compatible with the 'lunch' slot
 *  2. Must avoid reusing the gravy from the current lunch
 *  3. Applies same composition rules (cuisine, diet, style, slot)
 *
 * @param weeklyPlan - The current 7-day plan (will NOT be mutated).
 * @param tomorrowIndex - Day index 0–6 (Monday–Sunday).
 * @param components - Full component pool (already filtered by diet/style preferences).
 * @param preferences - User preferences (cuisine, diet, style).
 * @returns Object with cloned updated plan, old meal name, and new meal name — or null if no valid replacement exists.
 */
export function swapTomorrowLunch(
  weeklyPlan: WeeklyPlan,
  tomorrowIndex: number,
  components: MealComponent[],
  preferences: { cuisine: string; diet: string; style: string },
): { updatedPlan: WeeklyPlan; oldMeal: string; newMeal: string } | null {
  if (tomorrowIndex < 0 || tomorrowIndex > 6 || !weeklyPlan[tomorrowIndex]) {
    return null;
  }

  const currentDay = weeklyPlan[tomorrowIndex];
  const currentLunch = currentDay.lunch;

  // Determine cuisine for this day/slot using the schedule
  const schedule = buildCuisineSchedule();
  const cuisine = preferences.cuisine === 'both'
    ? schedule[tomorrowIndex].lunch
    : (preferences.cuisine as 'north_indian' | 'south_indian');

  // Build constraints: exclude current lunch's gravy (so swap is different)
  // and exclude dinner's components for same-day dedup
  const CATEGORIES: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
  const constraints: ComposeMealConstraints = {
    base:       { recentIds: new Set(), sameDayIds: new Set() },
    gravy:      { recentIds: new Set(), sameDayIds: new Set() },
    dry_veggie: { recentIds: new Set(), sameDayIds: new Set() },
    side:       { recentIds: new Set(), sameDayIds: new Set() },
  };

  // Add current lunch's gravy to recentIds so the swap picks a different one
  const currentGravy = currentLunch.components.find(c => c.category === 'gravy');
  if (currentGravy) constraints.gravy.recentIds.add(currentGravy.id);

  // Add dinner's component IDs as same-day exclusions
  for (const cat of CATEGORIES) {
    const dinnerComp = currentDay.dinner.components.find(c => c.category === cat);
    if (dinnerComp) constraints[cat].sameDayIds.add(dinnerComp.id);
  }

  try {
    const replacement = composeMeal(components, 'lunch', cuisine, constraints);

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
  } catch {
    return null;
  }
}

