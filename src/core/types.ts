// Core types — zero imports from adapters, WhatsApp, Twilio, or AWS modules

export interface Ingredient {
  name: string;
  quantity: string;
  category: string;
}

export interface Meal {
  id: string;
  name: string;
  cuisine: 'north_indian' | 'south_indian';
  diet: 'veg' | 'non_veg';
  style: 'health' | 'regular';
  slots: ('breakfast' | 'lunch' | 'dinner')[];
  ingredients: Ingredient[];
}

export interface MealFilter {
  cuisine?: 'north_indian' | 'south_indian' | 'both';
  diet?: 'veg' | 'non_veg' | 'both';
  style?: 'health' | 'regular';
  slot?: 'breakfast' | 'lunch' | 'dinner';
}

export type ComponentCategory = 'base' | 'gravy' | 'dry_veggie' | 'side';

export interface MealComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  cuisine: 'north_indian' | 'south_indian';
  diet: 'veg' | 'non_veg';
  style: 'health' | 'regular';
  slots: ('lunch' | 'dinner')[];
  ingredients: Ingredient[];
}

export interface ComposedMeal {
  components: MealComponent[];
  name: string;        // comma-separated component names
  ingredients: Ingredient[];  // aggregated from all components
}

export interface MealComponentFilter {
  cuisine?: 'north_indian' | 'south_indian' | 'both';
  diet?: 'veg' | 'non_veg' | 'both';
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

export type ConversationState =
  | 'awaiting_cuisine'
  | 'awaiting_diet'
  | 'awaiting_meal_style'
  | 'awaiting_cook_number_onboarding'
  | 'dish_preview'
  | 'main_menu'
  | 'more_options'
  | 'awaiting_cook_number'
  | 'awaiting_preference_cuisine'
  | 'awaiting_preference_diet';

export interface UserState {
  phoneNumber: string;
  onboardingComplete: boolean;
  conversationState: ConversationState;
  cuisinePreference?: 'north_indian' | 'south_indian' | 'both';
  dietPreference?: 'veg' | 'non_veg' | 'both';
  mealStyle?: 'health' | 'regular';
  weeklyPlan?: WeeklyPlan;
  weeklyPlanStartDate?: string;
  cookPhoneNumber?: string;
  excludedDishIds?: string[];
  candidateDishes?: CandidateDishes;
  lastButtonIds?: string[];
  isPreferenceChange?: boolean;
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
  CONFIRM_DISHES = 'CONFIRM_DISHES',
  MORE_OPTIONS = 'MORE_OPTIONS',
  CHANGE_PREFERENCE = 'CHANGE_PREFERENCE',
  CHANGE_COOK_NUMBER = 'CHANGE_COOK_NUMBER',
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
  ONBOARDING_COMPLETE = 'ONBOARDING_COMPLETE',
  MAIN_MENU = 'MAIN_MENU',
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
  MORE_OPTIONS_MENU = 'MORE_OPTIONS_MENU',
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
  };
  suggestedActions?: SuggestedAction[];
}

export interface BotResult {
  response: BotResponse;
  updatedState: UserState;
}
