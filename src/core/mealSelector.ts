// MealSelector — filter pipeline for meals and meal components
// Zero imports from adapters, WhatsApp, Twilio, or AWS modules

import type { RulesRepository, MealRepository, MealComponentRepository } from './ports';
import type {
  Meal,
  MealComponent,
  Rule,
  RuleEvaluationContext,
  RuleScope,
  ComponentCategory,
} from './types';
import { getApplicableRules } from './rulesEngine';

/**
 * MealSelector applies a declarative filter pipeline to narrow meal/component pools
 * based on rules loaded from a RulesRepository.
 */
export class MealSelector {
  constructor(
    private readonly rulesRepository: RulesRepository,
    private readonly mealRepository: MealRepository,
    private readonly mealComponentRepository: MealComponentRepository,
  ) {}

  /**
   * Apply filter rules in sequence (intersection semantics).
   *
   * Each filter rule narrows the pool. The result is the intersection of all
   * individual filter results applied in declaration order.
   *
   * Special handling:
   * - diet-filter + diet-fallback: when diet is 'non_veg' and a diet-fallback
   *   rule is present, the diet-filter passes both veg and non_veg through.
   * - style-filter + style-fallback: when style is 'health' and a style-fallback
   *   rule is present, regular items are added with "(Regular)" suffix when
   *   health items in a category are below threshold.
   */
  filterPool<T extends Meal | MealComponent>(
    pool: T[],
    rules: Rule[],
    context: RuleEvaluationContext,
  ): T[] {
    const filterRules = rules.filter((r) => r.action === 'filter');

    // Pre-check: is diet-fallback active?
    const dietFallbackRule = filterRules.find((r) => r.id === 'diet-fallback');
    const dietFallbackActive = dietFallbackRule != null &&
      (dietFallbackRule.conditions.preferenceValues ?? ['non_veg']).includes(context.userPreferences.diet);

    // Pre-check: is style-fallback active?
    const styleFallbackRule = filterRules.find((r) => r.id === 'style-fallback');
    const styleFallbackActive = styleFallbackRule != null &&
      (styleFallbackRule.conditions.preferenceValues ?? ['health']).includes(context.userPreferences.style);

    let result = [...pool];

    for (const rule of filterRules) {
      result = this.applyFilterRule(result, rule, context, {
        dietFallbackActive,
        styleFallbackActive,
        styleFallbackRule,
        fullPool: pool,
      });
    }

    return result;
  }

  /**
   * Apply a single filter rule to the pool.
   */
  private applyFilterRule<T extends Meal | MealComponent>(
    pool: T[],
    rule: Rule,
    context: RuleEvaluationContext,
    opts: {
      dietFallbackActive: boolean;
      styleFallbackActive: boolean;
      styleFallbackRule: Rule | undefined;
      fullPool: T[];
    },
  ): T[] {
    switch (rule.id) {
      case 'cuisine-filter':
        return this.applyCuisineFilter(pool, context);

      case 'diet-filter':
        // When diet-fallback is active for non_veg, pass both veg and non_veg through
        if (opts.dietFallbackActive) return pool;
        return this.applyDietFilter(pool, context);

      case 'diet-fallback':
        // Handled via dietFallbackActive flag in diet-filter
        return pool;

      case 'style-filter':
        return this.applyStyleFilter(pool, context);

      case 'style-fallback':
        return this.applyStyleFallback(pool, rule, context, opts.fullPool);

      case 'excluded-dishes':
        return this.applyExcludedDishes(pool, context);

      default:
        // Unknown filter rule — pass through unchanged
        return pool;
    }
  }

  /**
   * Cuisine filter:
   * - 'both': include items that have 'north_indian' in their cuisine array
   *   (this covers pure north_indian AND dual-tagged crossover items,
   *    while excluding south_indian-only items)
   * - single value: include items whose cuisine array contains that value
   */
  private applyCuisineFilter<T extends Meal | MealComponent>(
    pool: T[],
    context: RuleEvaluationContext,
  ): T[] {
    const pref = context.userPreferences.cuisine;
    if (pref === 'both') {
      return pool.filter((item) => (item as Meal | MealComponent).cuisine.includes('north_indian'));
    }
    return pool.filter((item) => (item as Meal | MealComponent).cuisine.includes(pref));
  }

  /**
   * Diet filter: when preference is 'both', pass all through.
   * Otherwise keep only items matching the diet preference.
   */
  private applyDietFilter<T extends Meal | MealComponent>(
    pool: T[],
    context: RuleEvaluationContext,
  ): T[] {
    const pref = context.userPreferences.diet;
    if (pref === 'both') return pool;
    return pool.filter((item) => (item as Meal | MealComponent).diet === pref);
  }

  /**
   * Style filter: keep only items matching the style preference.
   */
  private applyStyleFilter<T extends Meal | MealComponent>(
    pool: T[],
    context: RuleEvaluationContext,
  ): T[] {
    return pool.filter((item) => (item as Meal | MealComponent).style === context.userPreferences.style);
  }

  /**
   * Style fallback: when style is 'health' and items in a category < threshold,
   * add regular items with "(Regular)" suffix.
   * Only applies to lunch_component/dinner_component scope.
   *
   * @param pool - Current filtered pool (health items only after style-filter)
   * @param rule - The style-fallback rule
   * @param context - Evaluation context
   * @param fullPool - The original unfiltered pool, used to find regular items for fallback
   */
  private applyStyleFallback<T extends Meal | MealComponent>(
    pool: T[],
    rule: Rule,
    context: RuleEvaluationContext,
    fullPool: T[],
  ): T[] {
    const activateValues = rule.conditions.preferenceValues ?? ['health'];
    if (!activateValues.includes(context.userPreferences.style)) return pool;

    // Only applies to component scopes
    const scope = rule.scope;
    if (scope !== 'lunch_component' && scope !== 'dinner_component' && scope !== 'all_slots') {
      return pool;
    }

    const threshold = (rule.parameters?.threshold as number) ?? 2;
    const labelSuffix = (rule.parameters?.labelSuffix as string) ?? '(Regular)';

    // Check if pool has fewer health items than threshold
    const healthItems = pool.filter((item) => (item as Meal | MealComponent).style === 'health');

    if (healthItems.length < threshold) {
      // Find regular items from the full pool that match other current filters
      // (they should have the same cuisine etc. but style === 'regular')
      const currentIds = new Set(pool.map((item) => item.id));
      const regularItems = fullPool.filter((item) =>
        (item as Meal | MealComponent).style === 'regular' && !currentIds.has(item.id),
      );

      // Add regular items with label suffix
      const labeledRegular = regularItems.map((item) => ({
        ...item,
        name: `${item.name} ${labelSuffix}`,
      }));

      return [...pool, ...labeledRegular] as T[];
    }

    return pool;
  }

  /**
   * Excluded dishes filter: remove items whose IDs are in the exclusion list.
   */
  private applyExcludedDishes<T extends Meal | MealComponent>(
    pool: T[],
    context: RuleEvaluationContext,
  ): T[] {
    if (!context.excludedDishIds || context.excludedDishIds.length === 0) return pool;
    const excludedSet = new Set(context.excludedDishIds);
    return pool.filter((item) => !excludedSet.has(item.id));
  }

  // ── Constraint & Limit Methods ──────────────────────────────────────

  /**
   * Sliding window (limit action): deprioritize items whose IDs appear in
   * the recent history window. Returns pool sorted with non-recent items first.
   *
   * Progressive relaxation: if ALL items are in the window, return the full pool.
   */
  applySlidingWindow(
    pool: MealComponent[],
    rule: Rule,
    context: RuleEvaluationContext,
  ): MealComponent[] {
    if (pool.length === 0) return pool;

    // Use ALL IDs from history (no windowSize slicing) to maximize variety.
    // The existing progressive relaxation handles pool exhaustion.
    const recentIds = new Set<string>();
    for (const ids of Object.values(context.history)) {
      for (const id of ids) {
        recentIds.add(id);
      }
    }

    const nonRecent = pool.filter((item) => !recentIds.has(item.id));
    const recent = pool.filter((item) => recentIds.has(item.id));

    // Progressive relaxation: if all items are recent, return full pool
    if (nonRecent.length === 0) return pool;

    // Deprioritize: non-recent first, then recent
    return [...nonRecent, ...recent];
  }

  /**
   * Same-day deduplication (constrain action): exclude items whose IDs
   * appear in sameDaySelections for the same category.
   *
   * Progressive relaxation: if removing would leave pool empty, return full pool.
   */
  applySameDayDedup(
    pool: MealComponent[],
    context: RuleEvaluationContext,
  ): MealComponent[] {
    if (pool.length === 0) return pool;

    // Dedup base, gravy, and dry_veggie — sides may repeat same day
    const sameDayIds = new Set<string>();
    for (const [category, ids] of Object.entries(context.sameDaySelections)) {
      if (category !== 'base' && category !== 'gravy' && category !== 'dry_veggie') continue;
      for (const id of ids) {
        sameDayIds.add(id);
      }
    }

    if (sameDayIds.size === 0) return pool;

    const filtered = pool.filter((item) => !sameDayIds.has(item.id));

    // Progressive relaxation: if removing leaves pool empty, return full pool
    if (filtered.length === 0) return pool;

    return filtered;
  }

  /**
   * Ingredient overlap avoidance (constrain action): remove items that share
   * key ingredients with the overlapRef component.
   *
   * Uses rule.conditions.keyIngredients to determine which ingredients are "key".
   * A component overlaps if any of its ingredient names (case-insensitive) contain
   * a key ingredient keyword.
   *
   * Progressive relaxation: if removing would leave pool empty, return full pool.
   */
  /**
   * Protein groups — items within the same group are compatible,
   * but mixing across groups in a single meal is undesirable
   * (e.g. chicken + fish in the same meal).
   */
  private static readonly PROTEIN_GROUPS: Record<string, string> = {
    chicken: 'poultry',
    'chicken mince': 'poultry',
    fish: 'seafood',
    prawns: 'seafood',
    eggs: 'egg',
    paneer: 'dairy_protein',
    tofu: 'plant_protein',
  };

  /**
   * Extract the protein group(s) present in a component's ingredients.
   */
  private getProteinGroups(component: MealComponent): Set<string> {
    const groups = new Set<string>();
    for (const ing of component.ingredients) {
      const name = ing.name.toLowerCase();
      for (const [keyword, group] of Object.entries(MealSelector.PROTEIN_GROUPS)) {
        if (name.includes(keyword)) groups.add(group);
      }
    }
    return groups;
  }

  /**
   * Check if two components have conflicting proteins (different protein groups).
   */
  private hasProteinConflict(a: MealComponent, b: MealComponent): boolean {
    const groupsA = this.getProteinGroups(a);
    const groupsB = this.getProteinGroups(b);
    if (groupsA.size === 0 || groupsB.size === 0) return false;
    for (const g of groupsA) {
      if (groupsB.has(g)) return false;
    }
    return true;
  }

  applyIngredientOverlap(
    pool: MealComponent[],
    rule: Rule,
    overlapRef: MealComponent | null,
  ): MealComponent[] {
    if (pool.length === 0 || !overlapRef) return pool;

    const keyIngredients = rule.conditions.keyIngredients ?? [];
    if (keyIngredients.length === 0) return pool;

    // Extract key ingredient keywords present in the reference component
    const refKeys = this.extractKeyIngredients(overlapRef, keyIngredients);

    const filtered = pool.filter((item) => {
      // Check protein group conflict (e.g. chicken gravy + fish dry_veggie)
      if (this.hasProteinConflict(item, overlapRef)) return false;

      // Check if any key ingredient overlaps
      if (refKeys.size > 0) {
        const itemKeys = this.extractKeyIngredients(item, keyIngredients);
        for (const key of itemKeys) {
          if (refKeys.has(key)) return false;
        }
      }
      return true;
    });

    // Progressive relaxation: if removing leaves pool empty, return full pool
    if (filtered.length === 0) return pool;

    return filtered;
  }

  /**
   * Extract key ingredient keywords from a component's ingredients list.
   * Returns the set of matching keyword strings (lowercased).
   */
  private extractKeyIngredients(
    component: MealComponent,
    keyIngredients: string[],
  ): Set<string> {
    const keys = new Set<string>();
    for (const ing of component.ingredients) {
      const name = ing.name.toLowerCase();
      for (const keyword of keyIngredients) {
        if (name.includes(keyword.toLowerCase())) {
          keys.add(keyword.toLowerCase());
        }
      }
    }
    return keys;
  }

  /**
   * Determine the cuisine for a given day based on rules and context.
   *
   * - If cuisine preference is not 'both', return the single preference.
   * - If cuisine alternation rule is active, alternate: even days = north_indian,
   *   odd days = south_indian.
   */
  getCuisineForDay(
    dayIndex: number,
    rules: Rule[],
    context: RuleEvaluationContext,
  ): 'north_indian' | 'south_indian' {
    const pref = context.userPreferences.cuisine;
    if (pref !== 'both') return pref;

    // "both" cuisine = NI + crossover items — always use north_indian
    return 'north_indian';
  }

  /**
   * Apply all constraint and limit rules in sequence to a pool.
   *
   * For each rule:
   * - `limit` action → applySlidingWindow
   * - `constrain` with `same_day_dedup` → applySameDayDedup
   * - `constrain` with `ingredient_overlap` → applyIngredientOverlap
   * - `constrain` with `cuisine_alternation` → handled via getCuisineForDay (not applied to pool)
   */
  applyConstraints(
    pool: MealComponent[],
    rules: Rule[],
    context: RuleEvaluationContext,
    overlapRef?: MealComponent | null,
  ): MealComponent[] {
    let result = [...pool];

    const constraintRules = rules.filter(
      (r) => r.action === 'limit' || r.action === 'constrain',
    );

    for (const rule of constraintRules) {
      if (rule.action === 'limit') {
        result = this.applySlidingWindow(result, rule, context);
      } else if (rule.action === 'constrain') {
        switch (rule.conditions.constraintType) {
          case 'same_day_dedup':
            result = this.applySameDayDedup(result, context);
            break;
          case 'ingredient_overlap':
            result = this.applyIngredientOverlap(result, rule, overlapRef ?? null);
            break;
          case 'cuisine_alternation':
            // Cuisine alternation is handled via getCuisineForDay, not applied to pool directly
            break;
          default:
            break;
        }
      }
    }

    return result;
  }

  /**
   * Get the candidate pool of meals and components after applying all filter rules.
   *
   * Loads rules from the repository, determines applicable filter rules for the
   * given scope, fetches all meals/components, and applies the filter pipeline.
   *
   * Diet fallback and style fallback are handled specially:
   * - Diet fallback (non_veg): fetches both veg and non_veg items before filtering
   * - Style fallback (health): adds regular items with "(Regular)" suffix when
   *   health items in a category are below threshold
   */
  async getCandidatePool(
    context: RuleEvaluationContext,
  ): Promise<{ meals: Meal[]; components: MealComponent[] }> {
    const allRules = await this.rulesRepository.getRules();

    // Determine scope based on slot
    const scope: RuleScope = context.slot === 'breakfast'
      ? 'breakfast'
      : context.slot === 'lunch'
        ? 'lunch_component'
        : 'dinner_component';

    const applicableRules = getApplicableRules(allRules, scope, context);
    const filterRules = applicableRules.filter((r) => r.action === 'filter');

    // --- Fetch meals ---
    const allMeals = await this.mealRepository.getMeals({});
    let meals = this.applyMealFilters(allMeals, filterRules, context);
    // Filter meals by slot — only include meals whose slots array contains the target slot
    meals = meals.filter((m) => m.slots.includes(context.slot));

    // --- Fetch components ---
    const allComponents = await this.mealComponentRepository.getComponents({});
    let components = this.applyComponentFilters(allComponents, filterRules, context, scope);
    // Filter components by slot — only include components whose slots array contains the target slot
    components = components.filter((c) => (c.slots as string[]).includes(context.slot));

    return { meals, components };
  }

  /**
   * Apply filter rules to meals, handling diet fallback specially.
   */
  private applyMealFilters(
    allMeals: Meal[],
    filterRules: Rule[],
    context: RuleEvaluationContext,
  ): Meal[] {
    let pool = [...allMeals];

    for (const rule of filterRules) {
      switch (rule.id) {
        case 'cuisine-filter':
          pool = this.applyCuisineFilter(pool, context);
          break;

        case 'diet-filter': {
          // If diet fallback is active for non_veg, skip strict diet filtering
          // (include both veg and non_veg)
          const pref = context.userPreferences.diet;
          if (pref === 'both') break;
          if (pref === 'non_veg') {
            // Diet fallback: include both veg and non_veg
            break;
          }
          pool = this.applyDietFilter(pool, context);
          break;
        }

        case 'diet-fallback':
          // Handled inline with diet-filter above
          break;

        case 'style-filter':
          pool = this.applyStyleFilter(pool, context);
          break;

        case 'style-fallback':
          // Style fallback doesn't apply to meals (only components)
          break;

        case 'excluded-dishes':
          pool = this.applyExcludedDishes(pool, context);
          break;

        default:
          break;
      }
    }

    return pool;
  }

  /**
   * Apply filter rules to components, handling diet fallback and style fallback.
   */
  private applyComponentFilters(
    allComponents: MealComponent[],
    filterRules: Rule[],
    context: RuleEvaluationContext,
    scope: RuleScope,
  ): MealComponent[] {
    let pool = [...allComponents];

    // Find style-fallback rule for later use
    const styleFallbackRule = filterRules.find((r) => r.id === 'style-fallback');
    const threshold = (styleFallbackRule?.parameters?.threshold as number) ?? 2;
    const userStyle = context.userPreferences.style;
    const isHealthStyle = userStyle === 'health';
    const labelSuffix = isHealthStyle
      ? ((styleFallbackRule?.parameters?.healthLabelSuffix as string) ?? '(Regular)')
      : ((styleFallbackRule?.parameters?.regularLabelSuffix as string) ?? '(Healthy)');
    const fallbackStyle = isHealthStyle ? 'regular' : 'health';
    const styleFallbackActive = styleFallbackRule != null &&
      (styleFallbackRule.conditions.preferenceValues ?? []).includes(userStyle) &&
      (scope === 'lunch_component' || scope === 'dinner_component' || scope === 'all_slots');

    for (const rule of filterRules) {
      switch (rule.id) {
        case 'cuisine-filter':
          pool = this.applyCuisineFilter(pool, context);
          break;

        case 'diet-filter': {
          const pref = context.userPreferences.diet;
          if (pref === 'both') break;
          if (pref === 'non_veg') {
            // Diet fallback: include both veg and non_veg
            break;
          }
          pool = this.applyDietFilter(pool, context);
          break;
        }

        case 'diet-fallback':
          break;

        case 'style-filter': {
          if (styleFallbackActive) {
            // Don't apply strict style filter yet — we need to check per-category thresholds
            // Save the full pool before style filtering for fallback
            const preferredPool = pool.filter((c) => c.style === userStyle);
            const fallbackPool = pool.filter((c) => c.style === fallbackStyle);

            // Group preferred items by category and check thresholds
            const categories: ComponentCategory[] = ['base', 'gravy', 'dry_veggie', 'side'];
            const result: MealComponent[] = [];

            for (const cat of categories) {
              const preferredInCat = preferredPool.filter((c) => c.category === cat);
              if (preferredInCat.length < threshold) {
                // Add preferred items + fallback items with suffix
                result.push(...preferredInCat);
                const fallbackInCat = fallbackPool.filter((c) => c.category === cat);
                result.push(...fallbackInCat.map((c) => ({
                  ...c,
                  name: `${c.name} ${labelSuffix}`,
                })));
              } else {
                result.push(...preferredInCat);
              }
            }

            pool = result;
          } else {
            pool = this.applyStyleFilter(pool, context);
          }
          break;
        }

        case 'style-fallback':
          // Handled inline with style-filter above
          break;

        case 'excluded-dishes':
          pool = this.applyExcludedDishes(pool, context);
          break;

        default:
          break;
      }
    }

    return pool;
  }
}
