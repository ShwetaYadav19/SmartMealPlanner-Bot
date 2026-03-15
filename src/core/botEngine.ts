// BotEngine — intent-based conversation engine
// Zero imports from adapters, WhatsApp, Twilio, or AWS modules

import type { MealRepository, MealComponentRepository } from './ports';
import {
  Intent,
  ResponseType,
  type UserIntent,
  type UserState,
  type BotResult,
  type BotResponse,
  type SuggestedAction,
  type Meal,
  type ComposedMeal,
} from './types';
import { generateWeeklyPlan, extractTomorrowPlan, swapTomorrowLunch } from './planGenerator';
import { generateGroceryList } from './groceryListGenerator';
import { validatePhoneNumber } from './phoneValidation';

// --- Suggested action constants ---

const CUISINE_OPTIONS: SuggestedAction[] = [
  { id: 'north_indian', label: 'North Indian' },
  { id: 'south_indian', label: 'South Indian' },
  { id: 'both', label: 'Both' },
];

const DIET_OPTIONS: SuggestedAction[] = [
  { id: 'veg', label: 'Veg' },
  { id: 'non_veg', label: 'Non-Veg' },
  { id: 'both', label: 'Both' },
];

const STYLE_OPTIONS: SuggestedAction[] = [
  { id: 'health', label: 'Health' },
  { id: 'regular', label: 'Regular Home Meals' },
];

const MAIN_MENU_OPTIONS: SuggestedAction[] = [
  { id: 'weekly_plan', label: 'Weekly Meal Plan' },
  { id: 'weekly_grocery', label: 'Weekly Grocery List' },
  { id: 'tomorrow_plan', label: "Tomorrow's Plan" },
  { id: 'tomorrow_grocery', label: "Tomorrow's Grocery" },
  { id: 'send_to_cook', label: 'Send Menu to Cook' },
  { id: 'swap_lunch', label: 'Swap Lunch' },
  { id: 'save_cook', label: "Save Cook's Number" },
];

// --- Helper to create a default new-user state ---

function createDefaultState(phoneNumber: string): UserState {
  return {
    phoneNumber,
    onboardingComplete: false,
    conversationState: 'awaiting_cuisine',
  };
}

// --- Onboarding intent handlers ---

function handleNewUser(phoneNumber: string): BotResult {
  const state = createDefaultState(phoneNumber);
  return {
    response: {
      type: ResponseType.ONBOARDING_CUISINE_PROMPT,
      suggestedActions: CUISINE_OPTIONS,
    },
    updatedState: state,
  };
}

function handleAwaitingCuisine(intent: UserIntent, state: UserState): BotResult {
  if (intent.intent === Intent.SELECT_CUISINE && intent.payload) {
    const updatedState: UserState = {
      ...state,
      cuisinePreference: intent.payload as UserState['cuisinePreference'],
      conversationState: 'awaiting_diet',
    };
    return {
      response: {
        type: ResponseType.ONBOARDING_DIET_PROMPT,
        suggestedActions: DIET_OPTIONS,
      },
      updatedState,
    };
  }

  // Unknown or invalid intent — re-prompt
  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: CUISINE_OPTIONS,
    },
    updatedState: state,
  };
}

function handleAwaitingDiet(intent: UserIntent, state: UserState): BotResult {
  if (intent.intent === Intent.SELECT_DIET && intent.payload) {
    const updatedState: UserState = {
      ...state,
      dietPreference: intent.payload as UserState['dietPreference'],
      conversationState: 'awaiting_meal_style',
    };
    return {
      response: {
        type: ResponseType.ONBOARDING_STYLE_PROMPT,
        suggestedActions: STYLE_OPTIONS,
      },
      updatedState,
    };
  }

  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: DIET_OPTIONS,
    },
    updatedState: state,
  };
}

function handleAwaitingMealStyle(intent: UserIntent, state: UserState): BotResult {
  if (intent.intent === Intent.SELECT_MEAL_STYLE && intent.payload) {
    const updatedState: UserState = {
      ...state,
      mealStyle: intent.payload as UserState['mealStyle'],
      onboardingComplete: true,
      conversationState: 'main_menu',
    };
    return {
      response: {
        type: ResponseType.MAIN_MENU,
        suggestedActions: MAIN_MENU_OPTIONS,
      },
      updatedState,
    };
  }

  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: STYLE_OPTIONS,
    },
    updatedState: state,
  };
}

// --- Helpers ---

/**
 * Compute the ISO date string for the coming Monday (or today if it's Monday).
 */
/**
 * Return the Monday of the current week as an ISO date string (YYYY-MM-DD).
 * The weekly plan covers Mon–Sun, so anchoring to the current week's Monday
 * ensures "tomorrow" always falls within the plan range (index 0–6).
 */
/**
 * Return the Monday that anchors the weekly plan as an ISO date string (YYYY-MM-DD).
 *
 * The plan covers Mon–Sun (indices 0–6). We pick the Monday such that
 * *tomorrow* always falls within the plan:
 *  - Mon–Sat → current week's Monday (tomorrow is Tue–Sun, index 1–6)
 *  - Sunday  → next Monday (tomorrow is Monday, index 0)
 */
function getCurrentWeekMondayISO(): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...

  if (dayOfWeek === 0) {
    // Sunday — anchor to tomorrow (next Monday)
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + 1);
    const yyyy = nextMonday.getFullYear();
    const mm = String(nextMonday.getMonth() + 1).padStart(2, '0');
    const dd = String(nextMonday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Mon–Sat — anchor to this week's Monday
  const daysSinceMonday = dayOfWeek - 1; // Mon=0, Tue=1, ...
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Detect whether a stored weekly plan is in legacy single-dish format.
 * Legacy plans have lunch/dinner as plain Meal objects (no `components` array).
 * Returns true if any day's lunch or dinner lacks a `components` array.
 */
function isLegacyPlan(weeklyPlan: DayPlan[]): boolean {
  return weeklyPlan.some(
    day => !('components' in day.lunch) || !('components' in day.dinner),
  );
}


/**
 * Compute the day index (0=Monday..6=Sunday) for tomorrow relative to a plan start date.
 */
function getTomorrowIndex(weeklyPlanStartDate: string): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startDate = new Date(weeklyPlanStartDate + 'T00:00:00');
  const diffMs = tomorrow.getTime() - startDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// --- Main menu intent handler ---

async function handleMainMenu(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  const preferences = {
    cuisine: state.cuisinePreference ?? 'both',
    diet: state.dietPreference ?? 'veg',
    style: state.mealStyle ?? 'regular',
  };

  switch (intent.intent) {
    case Intent.GENERATE_PLAN: {
      const meals = await mealRepository.getMeals({
        cuisine: state.cuisinePreference,
        diet: state.dietPreference,
        style: state.mealStyle,
      });
      // Fetch all diet variants for components — bases and sides are always veg,
      // so filtering by non_veg would leave those categories empty.
      // The diet preference is applied inside composeMeal for gravy/dry_veggie only.
      const components = await mealComponentRepository.getComponents({
        cuisine: state.cuisinePreference,
        style: state.mealStyle,
      });
      try {
        const weeklyPlan = generateWeeklyPlan(meals, components, preferences);
        const weeklyPlanStartDate = getCurrentWeekMondayISO();
        const updatedState: UserState = {
          ...state,
          weeklyPlan,
          weeklyPlanStartDate,
          conversationState: 'main_menu',
        };
        return {
          response: {
            type: ResponseType.WEEKLY_PLAN,
            data: { weeklyPlan },
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState,
        };
      } catch {
        return {
          response: {
            type: ResponseType.ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
    }

    case Intent.VIEW_WEEKLY_GROCERY: {
      if (!state.weeklyPlan) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const allMeals: (Meal | ComposedMeal)[] = [];
      for (const day of state.weeklyPlan) {
        allMeals.push(day.breakfast, day.lunch, day.dinner);
      }
      const groceryList = generateGroceryList(allMeals);
      return {
        response: {
          type: ResponseType.WEEKLY_GROCERY_LIST,
          data: { groceryList },
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    case Intent.VIEW_TOMORROW_PLAN: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const dayPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
      if (!dayPlan) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      return {
        response: {
          type: ResponseType.TOMORROW_PLAN,
          data: { dayPlan },
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    case Intent.VIEW_TOMORROW_GROCERY: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const tomorrowPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
      if (!tomorrowPlan) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const tomorrowMeals: (Meal | ComposedMeal)[] = [tomorrowPlan.breakfast, tomorrowPlan.lunch, tomorrowPlan.dinner];
      const groceryList = generateGroceryList(tomorrowMeals);
      return {
        response: {
          type: ResponseType.TOMORROW_GROCERY_LIST,
          data: { groceryList },
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    case Intent.SEND_MENU_TO_COOK: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (!state.cookPhoneNumber) {
        return {
          response: {
            type: ResponseType.NO_COOK_ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const cookDayPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
      if (!cookDayPlan) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      return {
        response: {
          type: ResponseType.COOK_MESSAGE_SENT,
          data: { dayPlan: cookDayPlan, cookNumber: state.cookPhoneNumber },
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    case Intent.SWAP_LUNCH: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const tomorrowIdx = getTomorrowIndex(state.weeklyPlanStartDate);
      const components = await mealComponentRepository.getComponents({
        cuisine: state.cuisinePreference,
        style: state.mealStyle,
      });
      const swapResult = swapTomorrowLunch(state.weeklyPlan, tomorrowIdx, components, preferences);
      if (!swapResult) {
        return {
          response: {
            type: ResponseType.SWAP_NO_ALTERNATIVE,
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const updatedState: UserState = {
        ...state,
        weeklyPlan: swapResult.updatedPlan,
        conversationState: 'main_menu',
      };
      return {
        response: {
          type: ResponseType.SWAP_CONFIRMATION,
          data: { oldMeal: swapResult.oldMeal, newMeal: swapResult.newMeal },
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.SAVE_COOK_NUMBER: {
      const updatedState: UserState = {
        ...state,
        conversationState: 'awaiting_cook_number',
      };
      return {
        response: {
          type: ResponseType.COOK_NUMBER_PROMPT,
        },
        updatedState,
      };
    }

    default: {
      // UNKNOWN or any unrecognized intent
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }
  }
}

// --- Main entry point ---

export async function processIntent(
  intent: UserIntent,
  userState: UserState | null,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
  phoneNumber?: string,
): Promise<BotResult> {
  // New user — no state exists
  if (!userState) {
    return handleNewUser(phoneNumber ?? 'unknown');
  }

  // Route by conversation state
  switch (userState.conversationState) {
    case 'awaiting_cuisine':
      return handleAwaitingCuisine(intent, userState);

    case 'awaiting_diet':
      return handleAwaitingDiet(intent, userState);

    case 'awaiting_meal_style':
      return handleAwaitingMealStyle(intent, userState);

    case 'main_menu':
      return handleMainMenu(intent, userState, mealRepository, mealComponentRepository);

    case 'awaiting_cook_number': {
      if (intent.intent === Intent.PROVIDE_COOK_NUMBER && intent.payload) {
        const validation = validatePhoneNumber(intent.payload);
        if (validation.valid) {
          const updatedState: UserState = {
            ...userState,
            cookPhoneNumber: validation.normalized,
            conversationState: 'main_menu',
          };
          return {
            response: {
              type: ResponseType.COOK_NUMBER_SAVED,
              data: { cookNumber: validation.normalized },
              suggestedActions: MAIN_MENU_OPTIONS,
            },
            updatedState,
          };
        }
        // Invalid phone number
        return {
          response: {
            type: ResponseType.INVALID_PHONE,
          },
          updatedState: userState,
        };
      }
      // UNKNOWN or any other intent — re-prompt for phone number
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
        },
        updatedState: userState,
      };
    }

    default:
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: MAIN_MENU_OPTIONS,
        },
        updatedState: userState,
      };
  }
}

// Exported for testing and reuse by tasks 10.2/10.3
// Backward-compatible alias
const getComingMondayISO = getCurrentWeekMondayISO;

export {
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  STYLE_OPTIONS,
  MAIN_MENU_OPTIONS,
  createDefaultState,
  getComingMondayISO,
  getCurrentWeekMondayISO,
  getTomorrowIndex,
  isLegacyPlan,
};
