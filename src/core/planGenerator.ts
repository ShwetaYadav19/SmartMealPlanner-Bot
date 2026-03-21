// Plan generation — zero imports from adapters, WhatsApp, or AWS modules
import type { Meal, DayPlan, WeeklyPlan, MealComponent, ComposedMeal, ComponentCategory, Rule, RuleEvaluationContext } from './types';
import type { MealSelector } from './mealSelector';

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
        meal.cuisine.includes(preferredCuisine) &&
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
      // "both" cuisine = NI + crossover items, so always use north_indian
      schedule[d][SLOTS[s]] = 'north_indian';
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

const SIGNATURE_CATEGORIES: Set<string> = new Set(['protein', 'lentils', 'vegetables']);

/**
 * Extract only "signature" ingredient names (protein, lentils, vegetables)
 * from a MealComponent as a lowercase set, ignoring pantry staples.
 */
export function getSignatureIngredientNames(component: MealComponent): Set<string> {
  return new Set(
    component.ingredients
      .filter((ing) => SIGNATURE_CATEGORIES.has(ing.category))
      .map((ing) => ing.name.toLowerCase()),
  );
}

/**
 * Protein groups — items within the same group are compatible,
 * but mixing across groups in a single meal is undesirable
 * (e.g. chicken + fish in the same meal).
 */
const PROTEIN_GROUPS: Record<string, string> = {
  chicken: 'poultry',
  'chicken mince': 'poultry',
  fish: 'seafood',
  prawns: 'seafood',
  eggs: 'egg',
  paneer: 'dairy_protein',
  tofu: 'plant_protein',
  mutton: 'red_meat',
  'mutton bones': 'red_meat',
  'mutton mince': 'red_meat',
  'soya chunks': 'plant_protein',
  'soya granules': 'plant_protein',
};

/**
 * Keywords that identify a component as a protein dish.
 */
const PROTEIN_KEYWORDS: string[] = ['chicken', 'chicken mince', 'fish', 'prawns', 'eggs', 'paneer', 'tofu', 'mutton', 'mutton bones', 'mutton mince', 'soya chunks', 'soya granules'];

/**
 * Check if a component is a protein dish by testing whether any of its
 * ingredient names contain a protein keyword (case-insensitive).
 */
export function isProteinDish(component: MealComponent): boolean {
  for (const ing of component.ingredients) {
    const name = ing.name.toLowerCase();
    for (const keyword of PROTEIN_KEYWORDS) {
      if (name.includes(keyword)) return true;
    }
  }
  return false;
}

/**
 * Extract the protein group(s) present in a component's ingredients.
 */
function getProteinGroups(component: MealComponent): Set<string> {
  const groups = new Set<string>();
  for (const ing of component.ingredients) {
    const name = ing.name.toLowerCase();
    for (const [keyword, group] of Object.entries(PROTEIN_GROUPS)) {
      if (name.includes(keyword)) groups.add(group);
    }
  }
  return groups;
}

/**
 * Check if two components have conflicting proteins (different protein groups).
 * Returns true if both have proteins but from different groups (e.g. chicken + fish).
 */
function hasProteinConflict(a: MealComponent, b: MealComponent): boolean {
  const groupsA = getProteinGroups(a);
  const groupsB = getProteinGroups(b);
  // No conflict if either has no protein
  if (groupsA.size === 0 || groupsB.size === 0) return false;
  // Conflict if they have different protein groups
  for (const g of groupsA) {
    if (groupsB.has(g)) return false; // shared group = compatible
  }
  return true; // no shared group = conflict
}

/**
 * Check if two components share any ingredient name (case-insensitive)
 * or have conflicting proteins (e.g. chicken gravy + fish dry_veggie).
 */
function hasIngredientOverlap(a: MealComponent, b: MealComponent): boolean {
  const namesA = getSignatureIngredientNames(a);
  for (const name of getSignatureIngredientNames(b)) {
    if (namesA.has(name)) return true;
  }
  return hasProteinConflict(a, b);
}

/**
 * Pick a random element from an array.
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Filter components for cuisine coherence with a chosen base.
 *
 * When the base is "pure" (tagged with only one cuisine, e.g. Missi Roti = ["north_indian"]),
 * we prefer components that are also pure same-cuisine. This prevents pairing
 * Missi Roti with Sambar (crossover) — even though Sambar is tagged north_indian too,
 * it's culinarily a south Indian dish.
 *
 * When the base is crossover (tagged both), any item matching the day's cuisine is fine.
 *
 * Falls back to the full pool if strict filtering leaves nothing.
 */
function filterForCuisineCoherence(
  candidates: MealComponent[],
  base: MealComponent,
  dayCuisine: 'north_indian' | 'south_indian',
): MealComponent[] {
  // If the base is crossover (tagged both cuisines), no extra filtering needed
  if (base.cuisine.length > 1) return candidates;

  const baseCuisine = base.cuisine[0];

  if (baseCuisine === 'north_indian') {
    // Pure NI base (e.g. Roti): prefer pure NI items only.
    // Crossover items like Sambar are culinarily SI, so exclude them.
    const pureNI = candidates.filter(c => c.cuisine.length === 1 && c.cuisine[0] === 'north_indian');
    return pureNI.length > 0 ? pureNI : candidates;
  }

  // Pure SI base (e.g. Ragi Mudde): allow pure SI + crossover items.
  // Crossover items like Sambar, Egg Curry are culinarily SI-compatible.
  const siCompatible = candidates.filter(c => c.cuisine.includes('south_indian'));
  return siCompatible.length > 0 ? siCompatible : candidates;
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
 *     AND no dual-protein pairing AND no cross-group protein conflict
 *  2. Relax ingredient overlap
 *  3. Relax recentIds (sliding window)
 *  4. Relax dual-protein + cross-group protein constraints (graceful fallback)
 *  5. Relax sameDayIds (last resort — only if pool has a single item)
 *
 * Same-day dedup is treated as a near-hard constraint: it is only relaxed
 * when the candidate pool literally has one item (i.e. no alternative exists).
 *
 * @param dualProteinRef - When non-null and is a protein dish, candidates that
 *   are also protein dishes are skipped in Passes 1–3 to prevent dual-protein
 *   meals. Relaxed in Pass 4+ so composition never fails.
 */
function pickComponent(
  candidates: MealComponent[],
  recentIds: Set<string>,
  sameDayIds: Set<string>,
  overlapRef: MealComponent | null,
  proteinRef: MealComponent | null = null,
  dualProteinRef: MealComponent | null = null,
  additionalOverlapRefs: MealComponent[] = [],
): MealComponent {
  const shuffled = fisherYatesShuffle(candidates);
  const skipProtein = dualProteinRef !== null && isProteinDish(dualProteinRef);

  const hasAdditionalOverlap = (c: MealComponent): boolean =>
    additionalOverlapRefs.some(ref => hasIngredientOverlap(c, ref));

  // Pass 1: all constraints (including dual-protein prevention + cross-group protein conflict)
  for (const c of shuffled) {
    if (
      !recentIds.has(c.id) &&
      !sameDayIds.has(c.id) &&
      (!overlapRef || !hasIngredientOverlap(c, overlapRef)) &&
      !hasAdditionalOverlap(c) &&
      (!proteinRef || !hasProteinConflict(c, proteinRef)) &&
      (!skipProtein || !isProteinDish(c))
    ) return c;
  }
  // Pass 2: relax ingredient overlap (both overlapRef and additionalOverlapRefs), keep dual-protein + cross-group + same-day dedup
  for (const c of shuffled) {
    if (
      !recentIds.has(c.id) &&
      !sameDayIds.has(c.id) &&
      (!proteinRef || !hasProteinConflict(c, proteinRef)) &&
      (!skipProtein || !isProteinDish(c))
    ) return c;
  }
  // Pass 3: relax sliding window, keep dual-protein + cross-group + same-day dedup
  for (const c of shuffled) {
    if (
      !sameDayIds.has(c.id) &&
      (!proteinRef || !hasProteinConflict(c, proteinRef)) &&
      (!skipProtein || !isProteinDish(c))
    ) return c;
  }
  // Pass 4: relax dual-protein + cross-group protein constraints, keep same-day dedup
  for (const c of shuffled) {
    if (!sameDayIds.has(c.id)) return c;
  }
  // Pass 5: last resort — only reached when every candidate was used same day
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
  diet?: string,
  mealSelector?: MealSelector,
  constraintRules?: Rule[],
  constraintContext?: RuleEvaluationContext,
  lunchComponentRefs?: MealComponent[],
): ComposedMeal {
  // Filter by slot and cuisine
  const pool = components.filter(
    (c) => c.slots.includes(slot) && c.cuisine.includes(cuisine),
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

  // Apply diet preference to gravy and dry_veggie.
  // Bases and sides are inherently veg, so diet filtering doesn't apply to them.
  // Non-veg users keep the full pool (veg + non_veg) for variety.
  // HARD GUARDRAIL: veg users must NEVER see non-veg — no fallback to full pool.
  if (diet && diet !== 'both' && diet !== 'non_veg') {
    for (const cat of ['gravy', 'dry_veggie'] as ComponentCategory[]) {
      byCategory[cat] = byCategory[cat].filter((c) => c.diet === diet);
    }
  }

  // Validate each category has at least one component
  for (const cat of ['base', 'gravy', 'dry_veggie', 'side'] as ComponentCategory[]) {
    if (byCategory[cat].length === 0) {
      console.error('[composeMeal] EMPTY category %s for %s/%s, diet=%s. Pool size=%d',
        cat, cuisine, slot, diet ?? 'none', pool.length);
      throw new Error(
        `Not enough ${cat} components for ${cuisine}/${slot} to compose a meal`,
      );
    }
  }

  // When MealSelector is provided, use rule-based constraint evaluation
  if (mealSelector && constraintRules && constraintContext) {
    // 1. Pick base — apply constraints then pick first
    const constrainedBases = mealSelector.applyConstraints(
      fisherYatesShuffle(byCategory.base), constraintRules, constraintContext,
    );
    const base = constrainedBases[0];

    // Apply cuisine coherence: filter remaining categories based on base's cuisine
    const coherentGravies = filterForCuisineCoherence(byCategory.gravy, base, cuisine);
    const coherentDryVeggies = filterForCuisineCoherence(byCategory.dry_veggie, base, cuisine);
    const coherentSides = filterForCuisineCoherence(byCategory.side, base, cuisine);

    // 2. Pick gravy — apply constraints + ingredient overlap with base
    let constrainedGravies = mealSelector.applyIngredientOverlap(
      mealSelector.applyConstraints(
        fisherYatesShuffle(coherentGravies), constraintRules, constraintContext,
      ),
      constraintRules.find((r) => r.conditions.constraintType === 'ingredient_overlap') ?? constraintRules[0],
      base,
    );
    // Cross-meal overlap: filter out gravies sharing signature ingredients with lunch components
    if (lunchComponentRefs && lunchComponentRefs.length > 0) {
      const crossMealFiltered = constrainedGravies.filter(c =>
        !lunchComponentRefs.some(ref => hasIngredientOverlap(c, ref)),
      );
      if (crossMealFiltered.length > 0) constrainedGravies = crossMealFiltered;
      // Progressive relaxation: if all candidates overlap with lunch components, keep full pool
    }
    const gravy = constrainedGravies[0];

    // 3. Pick dry_veggie — apply constraints + ingredient overlap with gravy + protein conflict with gravy
    const constrainedDryVeggies = mealSelector.applyIngredientOverlap(
      mealSelector.applyConstraints(
        fisherYatesShuffle(coherentDryVeggies), constraintRules, constraintContext,
      ),
      constraintRules.find((r) => r.conditions.constraintType === 'ingredient_overlap') ?? constraintRules[0],
      gravy,
    );
    // Filter out protein conflicts with the chosen gravy
    const proteinSafe = constrainedDryVeggies.filter(c => !hasProteinConflict(c, gravy));
    // Filter out dual-protein pairings: if gravy is a protein dish, prefer non-protein dry_veggies
    const dualProteinSafe = isProteinDish(gravy)
      ? (proteinSafe.length > 0 ? proteinSafe : constrainedDryVeggies).filter(c => !isProteinDish(c))
      : (proteinSafe.length > 0 ? proteinSafe : constrainedDryVeggies);
    // Cross-meal overlap: filter out dry_veggies sharing signature ingredients with lunch components
    let dryVeggieCandidates = dualProteinSafe.length > 0
      ? dualProteinSafe
      : proteinSafe.length > 0 ? proteinSafe : constrainedDryVeggies;
    if (lunchComponentRefs && lunchComponentRefs.length > 0) {
      const crossMealFiltered = dryVeggieCandidates.filter(c =>
        !lunchComponentRefs.some(ref => hasIngredientOverlap(c, ref)),
      );
      if (crossMealFiltered.length > 0) dryVeggieCandidates = crossMealFiltered;
    }
    // Graceful fallback: if no candidates remain, use the best available pool
    const dryVeggie = dryVeggieCandidates[0];

    // 4. Pick side — apply constraints only
    const constrainedSides = mealSelector.applyConstraints(
      fisherYatesShuffle(coherentSides), constraintRules, constraintContext,
    );
    const side = constrainedSides[0];

    // 5. Assemble ComposedMeal
    const mealComponents = [base, gravy, dryVeggie, side];
    return {
      components: mealComponents,
      name: mealComponents.map((c) => c.name).join(', '),
      ingredients: mealComponents.flatMap((c) => c.ingredients),
    };
  }

  // Existing inline logic when MealSelector is not provided
  // 1. Pick base (no ingredient-overlap ref)
  const base = pickComponent(
    byCategory.base,
    constraints.base.recentIds,
    constraints.base.sameDayIds,
    null,
  );

  // Apply cuisine coherence: filter remaining categories based on base's cuisine
  const coherentGravies = filterForCuisineCoherence(byCategory.gravy, base, cuisine);
  const coherentDryVeggies = filterForCuisineCoherence(byCategory.dry_veggie, base, cuisine);
  const coherentSides = filterForCuisineCoherence(byCategory.side, base, cuisine);

  // 2. Pick gravy (avoid ingredient overlap with base + cross-meal overlap with lunch components)
  const gravy = pickComponent(
    coherentGravies,
    constraints.gravy.recentIds,
    constraints.gravy.sameDayIds,
    base,
    null,  // no protein ref for gravy
    null,  // no dual-protein ref for gravy
    lunchComponentRefs ?? [],  // cross-meal overlap refs
  );

  // 3. Pick dry_veggie (avoid ingredient overlap with gravy + protein conflict with gravy + dual-protein prevention + cross-meal overlap)
  const dryVeggie = pickComponent(
    coherentDryVeggies,
    constraints.dry_veggie.recentIds,
    constraints.dry_veggie.sameDayIds,
    gravy,
    gravy, // protein conflict reference
    gravy, // dual-protein reference — prevents two protein dishes in the same meal
    lunchComponentRefs ?? [],  // cross-meal overlap refs
  );

  // 4. Pick side (no ingredient-overlap ref)
  const side = pickComponent(
    coherentSides,
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
 * Build a RuleEvaluationContext for use with MealSelector constraint methods.
 */
function buildEvalContext(
  dayIndex: number,
  slot: 'breakfast' | 'lunch' | 'dinner',
  preferences: { cuisine: string; diet: string; style: string },
  history: Record<'lunch' | 'dinner', Record<ComponentCategory, string[]>>,
  sameDaySelections: Record<string, string[]>,
): RuleEvaluationContext {
  // Flatten history into a single Record<string, string[]> keyed by category
  const flatHistory: Record<string, string[]> = {};
  const slotHistory = slot === 'lunch' ? history.lunch : history.dinner;
  for (const [cat, ids] of Object.entries(slotHistory)) {
    flatHistory[cat] = [...ids];
  }

  return {
    userPreferences: {
      cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
      diet: preferences.diet as 'veg' | 'non_veg' | 'both',
      style: preferences.style as 'health' | 'regular',
    },
    excludedDishIds: [],
    slot,
    dayIndex,
    history: flatHistory,
    sameDaySelections,
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
  mealSelector?: MealSelector,
  rules?: Rule[],
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

  // When mealSelector is provided, load rules synchronously from the schedule
  // (rules are pre-loaded by the caller; we use getCuisineForDay for cuisine assignment)
  const useMealSelector = mealSelector != null;

  // Placeholder for constraint rules — populated lazily on first use
  // These are the limit/constrain rules used by MealSelector for composeMeal delegation
  let allConstraintRules: Rule[] = useMealSelector && rules ? rules : [];

  // Track recent meal ids per slot using a sliding 3-day window (for breakfast)
  const recentSlotHistory: Record<SlotName, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };
  // Track ALL used breakfast IDs — only repeat after pool is exhausted
  const allUsedBreakfastIds = new Set<string>();
  const BREAKFAST_RECENT_WINDOW = 3;

  // Track cumulative used IDs per slot per category (no eviction — full used set)
  const CATEGORIES: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
  const history: Record<'lunch' | 'dinner', Record<ComponentCategory, string[]>> = {
    lunch:  { base: [], gravy: [], dry_veggie: [], side: [] },
    dinner: { base: [], gravy: [], dry_veggie: [], side: [] },
  };

  // Compute pool sizes per category-slot for pool-exhaustion reset.
  // Key: `${category}-${slot}`, Value: number of eligible components.
  const poolSizes = new Map<string, number>();
  for (const slot of ['lunch', 'dinner'] as const) {
    for (const cat of CATEGORIES) {
      const eligible = components.filter(c =>
        c.category === cat &&
        c.slots.includes(slot) &&
        c.cuisine.includes(
          isBothCuisine ? 'north_indian' : (preferences.cuisine as 'north_indian' | 'south_indian'),
        ),
      );
      // Apply diet filtering consistent with composeMeal: only filter for strict veg
      const dietFiltered = (preferences.diet && preferences.diet !== 'both' && preferences.diet !== 'non_veg')
        ? eligible.filter(c => c.diet === preferences.diet)
        : eligible;
      const pool = dietFiltered.length > 0 ? dietFiltered : eligible;
      poolSizes.set(`${cat}-${slot}`, pool.length);
    }
  }

  const plan: WeeklyPlan = [];

  for (let d = 0; d < 7; d++) {
    // Pool-exhaustion reset: if all items in a category-slot pool have been used,
    // clear the used set so the cycle can restart.
    for (const slot of ['lunch', 'dinner'] as const) {
      for (const cat of CATEGORIES) {
        const key = `${cat}-${slot}`;
        const size = poolSizes.get(key) ?? 0;
        if (size > 0 && history[slot][cat].length >= size) {
          history[slot][cat] = [];
        }
      }
    }

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
    const breakfastRecentIds = new Set<string>(allUsedBreakfastIds);

    // If all breakfasts in the pool have been used, reset to allow repeats
    const breakfastPoolUsedAll = breakfastPool.every(m => allUsedBreakfastIds.has(m.id));
    if (breakfastPoolUsedAll) {
      breakfastRecentIds.clear();
    }

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
    allUsedBreakfastIds.add(breakfast.id);
    for (const key of getKeyIngredients(breakfast)) {
      usedKeyIngredients.add(key);
    }

    // --- Lunch (composed from components) ---
    const lunchCuisine: 'north_indian' | 'south_indian' = useMealSelector
      ? mealSelector!.getCuisineForDay(d, allConstraintRules, buildEvalContext(d, 'lunch', preferences, history, {}))
      : cuisineSchedule
        ? cuisineSchedule[d]['lunch']
        : (preferences.cuisine as 'north_indian' | 'south_indian');

    // Build lunch constraints — no same-day IDs yet (lunch is first)
    const lunchConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set(history.lunch.base),       sameDayIds: new Set() },
      gravy:      { recentIds: new Set(history.lunch.gravy),      sameDayIds: new Set() },
      dry_veggie: { recentIds: new Set(history.lunch.dry_veggie), sameDayIds: new Set() },
      side:       { recentIds: new Set(history.lunch.side),       sameDayIds: new Set() },
    };

    const lunchEvalContext = useMealSelector
      ? buildEvalContext(d, 'lunch', preferences, history, {})
      : undefined;
    const lunch = composeMeal(
      components, 'lunch', lunchCuisine, lunchConstraints, preferences.diet,
      useMealSelector ? mealSelector : undefined,
      useMealSelector ? allConstraintRules : undefined,
      lunchEvalContext,
    );

    // Collect lunch component IDs for same-day dedup
    const lunchIds: Record<ComponentCategory, string | undefined> = {
      base: undefined, gravy: undefined, dry_veggie: undefined, side: undefined,
    };
    for (const c of lunch.components) {
      lunchIds[c.category] = c.id;
    }

    // Extract lunch gravy and dry_veggie for cross-meal ingredient overlap reference
    const lunchComponentRefs = lunch.components.filter(
      c => c.category === 'gravy' || c.category === 'dry_veggie',
    );

    // --- Dinner (composed from components) ---
    const dinnerCuisine: 'north_indian' | 'south_indian' = useMealSelector
      ? mealSelector!.getCuisineForDay(d, allConstraintRules, buildEvalContext(d, 'dinner', preferences, history, {}))
      : cuisineSchedule
        ? cuisineSchedule[d]['dinner']
        : (preferences.cuisine as 'north_indian' | 'south_indian');

    // Build dinner constraints — same-day dedup for base, gravy, and dry_veggie
    // Sides (small pool) are allowed to repeat same day
    const dinnerConstraints: ComposeMealConstraints = {
      base:       { recentIds: new Set(history.dinner.base),       sameDayIds: new Set(lunchIds.base        ? [lunchIds.base]       : []) },
      gravy:      { recentIds: new Set(history.dinner.gravy),      sameDayIds: new Set(lunchIds.gravy      ? [lunchIds.gravy]      : []) },
      dry_veggie: { recentIds: new Set(history.dinner.dry_veggie), sameDayIds: new Set(lunchIds.dry_veggie ? [lunchIds.dry_veggie] : []) },
      side:       { recentIds: new Set(history.dinner.side),       sameDayIds: new Set() },
    };

    // Build same-day selections from lunch for MealSelector context
    // Base, gravy, and dry_veggie are deduped — sides may repeat same day
    const sameDaySelections: Record<string, string[]> = {};
    for (const c of lunch.components) {
      if (c.category !== 'base' && c.category !== 'gravy' && c.category !== 'dry_veggie') continue;
      if (!sameDaySelections[c.category]) sameDaySelections[c.category] = [];
      sameDaySelections[c.category].push(c.id);
    }

    const dinnerEvalContext = useMealSelector
      ? buildEvalContext(d, 'dinner', preferences, history, sameDaySelections)
      : undefined;
    const dinner = composeMeal(
      components, 'dinner', dinnerCuisine, dinnerConstraints, preferences.diet,
      useMealSelector ? mealSelector : undefined,
      useMealSelector ? allConstraintRules : undefined,
      dinnerEvalContext,
      lunchComponentRefs,
    );

    plan.push({ day: DAYS[d], breakfast, lunch, dinner });

    // Update breakfast sliding window
    recentSlotHistory.breakfast.push(breakfast.id);
    if (recentSlotHistory.breakfast.length > BREAKFAST_RECENT_WINDOW) {
      recentSlotHistory.breakfast.shift();
    }

    // Update per-category cumulative used sets for lunch and dinner (no eviction)
    for (const slot of ['lunch', 'dinner'] as const) {
      const meal = slot === 'lunch' ? lunch : dinner;
      for (const cat of CATEGORIES) {
        const comp = meal.components.find(c => c.category === cat);
        if (comp) {
          history[slot][cat].push(comp.id);
        }
      }
    }
  }

  return plan;
}


/**
 * Generate N alternative meals for a specific day and slot,
 * respecting same-day dedup against the other slot's components.
 *
 * - For breakfast: filter meals by preferences and slot, exclude the current breakfast, return up to `count` alternatives.
 * - For lunch/dinner: use the composeMeal pipeline to generate alternative composed meals,
 *   respecting same-day dedup against the other slot's components.
 */
export function generateAlternatives(
  weeklyPlan: WeeklyPlan,
  dayIndex: number,
  slot: 'breakfast' | 'lunch' | 'dinner',
  meals: Meal[],
  components: MealComponent[],
  preferences: { cuisine: string; diet: string; style: string },
  count: number,
): (Meal | ComposedMeal)[] {
  if (dayIndex < 0 || dayIndex > 6 || !weeklyPlan[dayIndex]) return [];

  const dayPlan = weeklyPlan[dayIndex];

  if (slot === 'breakfast') {
    // Filter meals for breakfast slot
    const breakfastMeals = mealsForSlot(meals, 'breakfast');
    // Hard guardrail: filter by diet and cuisine — non-negotiable
    const dietFiltered = breakfastMeals.filter((m) => {
      // Diet check: veg users must never see non_veg
      if (preferences.diet !== 'both' && preferences.diet !== 'non_veg' && m.diet !== preferences.diet) return false;
      // Cuisine check: north_indian users must never see south_indian and vice versa
      // Strict match: exclude dual-tagged meals (e.g. Dosa tagged ["south_indian","north_indian"])
      if (preferences.cuisine !== 'both' && (m.cuisine.length !== 1 || m.cuisine[0] !== preferences.cuisine)) return false;
      // Style check
      if (preferences.style && m.style !== preferences.style) return false;
      return true;
    });
    const currentId = dayPlan.breakfast.id;
    // Exclude the current breakfast
    const candidates = dietFiltered.filter((m) => m.id !== currentId);
    // Shuffle and return up to count
    return fisherYatesShuffle(candidates).slice(0, count);
  }

  // For lunch/dinner: compose alternative meals using the composeMeal pipeline
  const currentMeal = slot === 'lunch' ? dayPlan.lunch : dayPlan.dinner;
  const otherSlot = slot === 'lunch' ? 'dinner' : 'lunch';
  const otherMeal = slot === 'lunch' ? dayPlan.dinner : dayPlan.lunch;

  // Determine cuisine
  const cuisine: 'north_indian' | 'south_indian' = preferences.cuisine === 'both'
    ? 'north_indian'
    : (preferences.cuisine as 'north_indian' | 'south_indian');

  // Collect IDs from the other slot for same-day dedup (base, gravy, dry_veggie)
  const otherSlotIds: Record<ComponentCategory, Set<string>> = {
    base: new Set<string>(),
    gravy: new Set<string>(),
    dry_veggie: new Set<string>(),
    side: new Set<string>(),
  };
  for (const c of otherMeal.components) {
    if (c.category === 'base' || c.category === 'gravy' || c.category === 'dry_veggie') {
      otherSlotIds[c.category].add(c.id);
    }
  }

  // Collect current meal's component IDs to try to avoid repeating them
  const currentIds = new Set(currentMeal.components.map((c) => c.id));

  const alternatives: ComposedMeal[] = [];
  const usedGravyIds = new Set<string>();

  for (let i = 0; i < count; i++) {
    // Build constraints: same-day dedup from other slot + exclude gravies already used in alternatives
    const constraints: ComposeMealConstraints = {
      base:       { recentIds: new Set(), sameDayIds: otherSlotIds.base },
      gravy:      { recentIds: new Set([...currentIds, ...usedGravyIds]), sameDayIds: otherSlotIds.gravy },
      dry_veggie: { recentIds: new Set(), sameDayIds: otherSlotIds.dry_veggie },
      side:       { recentIds: new Set(), sameDayIds: new Set() },
    };

    try {
      const alt = composeMeal(components, slot as 'lunch' | 'dinner', cuisine, constraints, preferences.diet);
      // Only add if it differs from the current meal (check gravy ID as primary differentiator)
      const altGravy = alt.components.find((c) => c.category === 'gravy');
      const currentGravy = currentMeal.components.find((c) => c.category === 'gravy');
      if (altGravy && currentGravy && altGravy.id !== currentGravy.id) {
        alternatives.push(alt);
        if (altGravy) usedGravyIds.add(altGravy.id);
      } else if (!currentGravy || !altGravy) {
        alternatives.push(alt);
      }
    } catch {
      // If composition fails, stop generating more alternatives
      break;
    }
  }

  return alternatives;
}

/**
 * Regenerate a weekly plan excluding ~70% of meals from the current plan.
 * Collects meal/component IDs from the current plan, randomly selects ~70%
 * to exclude, and passes them as excludedDishIds to the generation pipeline.
 */
export function regenerateWeeklyPlan(
  currentPlan: WeeklyPlan,
  meals: Meal[],
  components: MealComponent[],
  preferences: { cuisine: string; diet: string; style: string },
  mealSelector?: MealSelector,
  rules?: Rule[],
): WeeklyPlan {
  // Collect all meal/component IDs from the current plan
  const allIds = new Set<string>();
  for (const day of currentPlan) {
    allIds.add(day.breakfast.id);
    for (const c of day.lunch.components) allIds.add(c.id);
    for (const c of day.dinner.components) allIds.add(c.id);
  }

  const idArray = Array.from(allIds);
  const shuffled = fisherYatesShuffle(idArray);

  // Select ~70% to exclude
  const excludeCount = Math.round(idArray.length * 0.7);
  const excludedIds = new Set(shuffled.slice(0, excludeCount));

  // Filter out excluded meals
  const filteredMeals = meals.filter((m) => !excludedIds.has(m.id));
  // Filter out excluded components
  const filteredComponents = components.filter((c) => !excludedIds.has(c.id));

  // If filtering removed too many items, fall back to full pools
  const safeMeals = mealsForSlot(filteredMeals, 'breakfast').length > 0 ? filteredMeals : meals;

  // Check per-category sufficiency: each category must have at least 1 component
  // for each slot/cuisine combo. If a category is depleted, selectively un-exclude
  // the minimum IDs needed to restore it, preserving as many exclusions as possible.
  const isBoth = preferences.cuisine === 'both';
  const targetCuisine: 'north_indian' | 'south_indian' = isBoth ? 'north_indian' : preferences.cuisine as 'north_indian' | 'south_indian';
  const REQUIRED_CATEGORIES: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];

  for (const slot of ['lunch', 'dinner'] as const) {
    for (const cat of REQUIRED_CATEGORIES) {
      const hasAny = filteredComponents.some(c =>
        c.category === cat && c.slots.includes(slot) && c.cuisine.includes(targetCuisine),
      );
      if (!hasAny) {
        // Find excluded components that would fill this gap and un-exclude them
        for (const c of components) {
          if (
            excludedIds.has(c.id) &&
            c.category === cat &&
            c.slots.includes(slot) &&
            c.cuisine.includes(targetCuisine)
          ) {
            excludedIds.delete(c.id);
            filteredComponents.push(c);
            break; // one is enough
          }
        }
      }
    }
  }

  const safeComponents = filteredComponents;

  return generateWeeklyPlan(safeMeals, safeComponents, preferences, mealSelector, rules);
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
    const replacement = composeMeal(components, 'lunch', cuisine, constraints, preferences.diet);

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

