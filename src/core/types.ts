// Core types — zero imports from adapters, WhatsApp, Twilio, or AWS modules

export interface Ingredient {
  name: string;
  quantity: string;
  category: string;
}

export interface Meal {
  id: string;
  name: string;
  cuisine: ('north_indian' | 'south_indian')[];
  diet: 'veg' | 'non_veg';
  style: 'health' | 'regular';
  slots: ('breakfast' | 'lunch' | 'dinner')[];
  ingredients: Ingredient[];
}

export interface MealFilter {
  cuisine?: 'north_indian' | 'south_indian' | 'both';
  diet?: 'veg' | 'non_veg' | 'veg_with_eggs';
  style?: 'health' | 'regular';
  slot?: 'breakfast' | 'lunch' | 'dinner';
}

export type ComponentCategory = 'base' | 'gravy' | 'dry_veggie' | 'side';

export interface MealComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  cuisine: ('north_indian' | 'south_indian')[];
  diet: 'veg' | 'non_veg';
  style: 'health' | 'regular';
  slots: ('lunch' | 'dinner')[];
  ingredients: Ingredient[];
  keyIngredient?: string;
}

export interface ComposedMeal {
  components: MealComponent[];
  name: string;        // comma-separated component names
  ingredients: Ingredient[];  // aggregated from all components
}

export interface MealComponentFilter {
  cuisine?: 'north_indian' | 'south_indian' | 'both';
  diet?: 'veg' | 'non_veg' | 'veg_with_eggs';
  style?: 'health' | 'regular';
  slot?: 'lunch' | 'dinner';
  category?: ComponentCategory;
}

export interface DayPlan {
  day: string;
  breakfast: Meal;
  lunch: ComposedMeal;
  dinner: ComposedMeal;
}

export type WeeklyPlan = DayPlan[];

export interface GroceryItem {
  name: string;
  quantity: string;
  category: string;
}

export type MealFormat = 'quick_meal' | 'home_meal' | 'full_thali';

export type MealFormatPreset = 'light' | 'regular_format' | 'full_thali_preset';

/** Maps a MealFormat to the component categories included in a composed meal */
export const MEAL_FORMAT_CATEGORIES: Record<MealFormat, ComponentCategory[]> = {
  quick_meal: ['base', 'gravy'],
  home_meal: ['base', 'gravy', 'dry_veggie'],
  full_thali: ['base', 'gravy', 'dry_veggie', 'side'],
};

/** Maps a preset to lunch/dinner format pair */
export const MEAL_FORMAT_PRESETS: Record<MealFormatPreset, { lunch: MealFormat; dinner: MealFormat }> = {
  light:             { lunch: 'quick_meal', dinner: 'quick_meal' },
  regular_format:    { lunch: 'home_meal',  dinner: 'quick_meal' },
  full_thali_preset: { lunch: 'full_thali', dinner: 'full_thali' },
};

export type PreviewStep = 'breakfast' | 'base' | 'gravy' | 'dry_veggie' | 'side' | 'confirm';

export const PREVIEW_STEP_ORDER: PreviewStep[] = ['breakfast', 'base', 'gravy', 'dry_veggie', 'side', 'confirm'];

export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'expired' | 'cancelled';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  razorpaySubscriptionId?: string;
  razorpayPaymentId?: string;
  planId?: string;
  currentPeriodStart?: string;  // ISO date
  currentPeriodEnd?: string;    // ISO date
  createdAt?: string;           // ISO date
}

export type ConversationState =
  | 'awaiting_cuisine'
  | 'awaiting_diet'
  | 'awaiting_meal_style'
  | 'awaiting_meal_format'
  | 'awaiting_preference_lunch_format'
  | 'awaiting_preference_dinner_format'
  | 'awaiting_payment'
  | 'awaiting_cook_number_onboarding'
  | 'dish_preview'
  | 'main_menu'
  | 'awaiting_cook_number'
  | 'awaiting_preference_cuisine'
  | 'awaiting_preference_diet'
  | 'awaiting_preference_style'
  | 'change_plan_menu'
  | 'few_meals_day_select'
  | 'few_meals_slot_select'
  | 'few_meals_alternatives'
  | 'entire_plan_confirm'
  | 'daily_grocery_prompt'
  | 'daily_cook_prompt'
  | 'happy_grocery_prompt'
  | 'happy_daily_prompt'
  | 'regenerate_plan_menu';

export interface UserState {
  phoneNumber: string;
  onboardingComplete: boolean;
  conversationState: ConversationState;
  cuisinePreference?: 'north_indian' | 'south_indian' | 'both';
  dietPreference?: 'veg' | 'non_veg' | 'veg_with_eggs';
  mealStyle?: 'health' | 'regular';
  lunchFormat?: MealFormat;
  dinnerFormat?: MealFormat;
  weeklyPlan?: WeeklyPlan;
  weeklyPlanStartDate?: string;
  cookPhoneNumber?: string;
  excludedDishIds?: string[];
  candidateDishes?: CandidateDishes;
  lastButtonIds?: string[];
  isPreferenceChange?: boolean;
  previewStep?: PreviewStep;
  fewMealsSelectedDay?: number;
  fewMealsSelectedSlot?: 'breakfast' | 'lunch' | 'dinner';
  fewMealsAlternatives?: (Meal | ComposedMeal)[];
  previousWeeklyPlan?: WeeklyPlan;
  subscription?: SubscriptionInfo;
}

export interface ComponentsByCategory {
  base: MealComponent[];
  gravy: MealComponent[];
  dry_veggie: MealComponent[];
  side: MealComponent[];
}

export interface CandidateDishes {
  breakfasts: Meal[];
  lunchComponents: ComponentsByCategory;
  dinnerComponents: ComponentsByCategory;
}

export enum Intent {
  SELECT_CUISINE = 'SELECT_CUISINE',
  SELECT_DIET = 'SELECT_DIET',
  SELECT_MEAL_STYLE = 'SELECT_MEAL_STYLE',
  SELECT_MEAL_FORMAT = 'SELECT_MEAL_FORMAT',
  SELECT_LUNCH_FORMAT = 'SELECT_LUNCH_FORMAT',
  SELECT_DINNER_FORMAT = 'SELECT_DINNER_FORMAT',
  GENERATE_PLAN = 'GENERATE_PLAN',
  VIEW_WEEKLY_GROCERY = 'VIEW_WEEKLY_GROCERY',
  VIEW_TOMORROW_PLAN = 'VIEW_TOMORROW_PLAN',
  VIEW_TOMORROW_GROCERY = 'VIEW_TOMORROW_GROCERY',
  SEND_MENU_TO_COOK = 'SEND_MENU_TO_COOK',
  SWAP_LUNCH = 'SWAP_LUNCH',
  SAVE_COOK_NUMBER = 'SAVE_COOK_NUMBER',
  PROVIDE_COOK_NUMBER = 'PROVIDE_COOK_NUMBER',
  SKIP_COOK_NUMBER = 'SKIP_COOK_NUMBER',
  REMOVE_DISH = 'REMOVE_DISH',
  REMOVE_DISHES = 'REMOVE_DISHES',
  CONFIRM_DISHES = 'CONFIRM_DISHES',
  NEXT_CATEGORY = 'NEXT_CATEGORY',
  CHANGE_PREFERENCE = 'CHANGE_PREFERENCE',
  CHANGE_COOK_NUMBER = 'CHANGE_COOK_NUMBER',
  CHANGE_PLAN = 'CHANGE_PLAN',
  CHANGE_TOMORROW_MEALS = 'CHANGE_TOMORROW_MEALS',
  CHANGE_FEW_MEALS = 'CHANGE_FEW_MEALS',
  CHANGE_ENTIRE_PLAN = 'CHANGE_ENTIRE_PLAN',
  SELECT_DAY = 'SELECT_DAY',
  SELECT_MEAL_SLOT = 'SELECT_MEAL_SLOT',
  SELECT_ALTERNATIVE = 'SELECT_ALTERNATIVE',
  CHANGE_MORE_MEALS = 'CHANGE_MORE_MEALS',
  DONE_CHANGING = 'DONE_CHANGING',
  ACCEPT_PLAN = 'ACCEPT_PLAN',
  RETRY_PLAN = 'RETRY_PLAN',
  HAPPY_WITH_MENU = 'HAPPY_WITH_MENU',
  ADHOC_MENU = 'ADHOC_MENU',
  DAILY_GROCERY_YES = 'DAILY_GROCERY_YES',
  DAILY_GROCERY_NO = 'DAILY_GROCERY_NO',
  DAILY_COOK_YES = 'DAILY_COOK_YES',
  DAILY_COOK_NO = 'DAILY_COOK_NO',
  HAPPY_GROCERY_YES = 'HAPPY_GROCERY_YES',
  HAPPY_GROCERY_NO = 'HAPPY_GROCERY_NO',
  HAPPY_DAILY_YES = 'HAPPY_DAILY_YES',
  HAPPY_DAILY_NO = 'HAPPY_DAILY_NO',
  KEEP_PREFERENCES = 'KEEP_PREFERENCES',
  CHECK_PAYMENT_STATUS = 'CHECK_PAYMENT_STATUS',
  UNKNOWN = 'UNKNOWN',
}

export interface UserIntent {
  intent: Intent;
  payload?: string;
}

export enum ResponseType {
  ONBOARDING_CUISINE_PROMPT = 'ONBOARDING_CUISINE_PROMPT',
  ONBOARDING_DIET_PROMPT = 'ONBOARDING_DIET_PROMPT',
  ONBOARDING_STYLE_PROMPT = 'ONBOARDING_STYLE_PROMPT',
  ONBOARDING_MEAL_FORMAT_PROMPT = 'ONBOARDING_MEAL_FORMAT_PROMPT',
  ONBOARDING_LUNCH_FORMAT_PROMPT = 'ONBOARDING_LUNCH_FORMAT_PROMPT',
  ONBOARDING_DINNER_FORMAT_PROMPT = 'ONBOARDING_DINNER_FORMAT_PROMPT',
  ONBOARDING_COMPLETE = 'ONBOARDING_COMPLETE',
  WEEKLY_PLAN = 'WEEKLY_PLAN',
  WEEKLY_GROCERY_LIST = 'WEEKLY_GROCERY_LIST',
  TOMORROW_PLAN = 'TOMORROW_PLAN',
  TOMORROW_GROCERY_LIST = 'TOMORROW_GROCERY_LIST',
  COOK_NUMBER_PROMPT = 'COOK_NUMBER_PROMPT',
  COOK_NUMBER_SAVED = 'COOK_NUMBER_SAVED',
  COOK_MESSAGE_SENT = 'COOK_MESSAGE_SENT',
  SWAP_CONFIRMATION = 'SWAP_CONFIRMATION',
  NO_PLAN_ERROR = 'NO_PLAN_ERROR',
  NO_COOK_ERROR = 'NO_COOK_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_PHONE = 'INVALID_PHONE',
  SWAP_NO_ALTERNATIVE = 'SWAP_NO_ALTERNATIVE',
  EXPIRED_PLAN_PROMPT = 'EXPIRED_PLAN_PROMPT',
  DAILY_REMINDER = 'DAILY_REMINDER',
  WEEKLY_REMINDER = 'WEEKLY_REMINDER',
  COOK_NUMBER_ONBOARDING_PROMPT = 'COOK_NUMBER_ONBOARDING_PROMPT',
  DISH_PREVIEW = 'DISH_PREVIEW',
  DISH_REMOVED = 'DISH_REMOVED',
  DISH_PREVIEW_EMPTY_ERROR = 'DISH_PREVIEW_EMPTY_ERROR',
  CHANGE_PLAN_MENU = 'CHANGE_PLAN_MENU',
  FEW_MEALS_DAY_PROMPT = 'FEW_MEALS_DAY_PROMPT',
  FEW_MEALS_SLOT_PROMPT = 'FEW_MEALS_SLOT_PROMPT',
  FEW_MEALS_ALTERNATIVES = 'FEW_MEALS_ALTERNATIVES',
  FEW_MEALS_UPDATED = 'FEW_MEALS_UPDATED',
  FEW_MEALS_NO_ALTERNATIVE = 'FEW_MEALS_NO_ALTERNATIVE',
  ENTIRE_PLAN_PREVIEW = 'ENTIRE_PLAN_PREVIEW',
  HAPPY_MENU = 'HAPPY_MENU',
  ADHOC_MENU = 'ADHOC_MENU',
  DAILY_COOK_PROMPT = 'DAILY_COOK_PROMPT',
  DAILY_FLOW_DONE = 'DAILY_FLOW_DONE',
  HAPPY_GROCERY_PROMPT = 'HAPPY_GROCERY_PROMPT',
  HAPPY_DAILY_PROMPT = 'HAPPY_DAILY_PROMPT',
  REGENERATE_PLAN_MENU = 'REGENERATE_PLAN_MENU',
  PAYMENT_PROMPT = 'PAYMENT_PROMPT',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  ERROR = 'ERROR',
}

export interface SuggestedAction {
  id: string;
  label: string;
}

export interface BotResponse {
  type: ResponseType;
  data?: {
    weeklyPlan?: WeeklyPlan;
    dayPlan?: DayPlan;
    groceryList?: GroceryItem[];
    oldMeal?: string;
    newMeal?: string;
    cookNumber?: string;
    dayName?: string;
    candidateDishes?: CandidateDishes;
    removedDishName?: string;
    replacementDishName?: string;
    removedComponentName?: string;
    removedComponentCategory?: string;
    previewStep?: PreviewStep;
    paymentLink?: string;
    subscriptionAmount?: string;
  };
  suggestedActions?: SuggestedAction[];
}

export interface BotResult {
  response: BotResponse;
  updatedState: UserState;
}

// ── Rules Engine Types ──────────────────────────────────────────────

/** Action types supported by the rules engine */
export type RuleAction = 'filter' | 'prefer' | 'constrain' | 'limit';

/** Scopes a rule can target */
export type RuleScope = 'breakfast' | 'lunch_component' | 'dinner_component' | 'all_slots';

/** Conditions that determine when a rule activates */
export interface RuleConditions {
  preferenceField?: 'cuisine' | 'diet' | 'style';
  preferenceValues?: string[];
  constraintType?: 'same_day_dedup' | 'ingredient_overlap' | 'cuisine_alternation';
  windowSize?: number;
  whitelist?: string[];
  keyIngredients?: string[];
  autoKeyCategories?: string[];
}

/** Evaluation context passed at runtime */
export interface RuleEvaluationContext {
  userPreferences: {
    cuisine: 'north_indian' | 'south_indian' | 'both';
    diet: 'veg' | 'non_veg' | 'veg_with_eggs';
    style: 'health' | 'regular';
  };
  excludedDishIds: string[];
  slot: 'breakfast' | 'lunch' | 'dinner';
  dayIndex: number;
  history: Record<string, string[]>;
  sameDaySelections: Record<string, string[]>;
}

/** A single rule definition as stored in the rules file */
export interface Rule {
  id: string;
  name: string;
  description: string;
  scope: RuleScope;
  categories?: ComponentCategory[];
  action: RuleAction;
  conditions: RuleConditions;
  parameters?: Record<string, unknown>;
}
