// BotEngine — intent-based conversation engine
// Zero imports from adapters, WhatsApp, Twilio, or AWS modules

import type { MealRepository, MealComponentRepository } from './ports';
import {
  Intent,
  ResponseType,
  PREVIEW_STEP_ORDER,
  type PreviewStep,
  type UserIntent,
  type UserState,
  type BotResult,
  type BotResponse,
  type SuggestedAction,
  type Meal,
  type ComposedMeal,
  type DayPlan,
} from './types';
import { generateWeeklyPlan, extractTomorrowPlan, swapTomorrowLunch } from './planGenerator';
import { generateGroceryList } from './groceryListGenerator';
import { validatePhoneNumber } from './phoneValidation';
import { generateCandidateDishes, removeBreakfast, removeComponent, buildPlanFromComponents, hasMinimumComponents, type DishPreviewDeps } from './dishPreview';

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

const SKIP_COOK_NUMBER_OPTION: SuggestedAction[] = [
  { id: 'skip_cook', label: 'Skip' },
];

const MAIN_MENU_OPTIONS: SuggestedAction[] = [
  { id: 'tomorrow_plan', label: "Tomorrow's Meal Plan" },
  { id: 'tomorrow_grocery', label: "Tomorrow's Grocery" },
  { id: 'send_to_cook', label: 'Send Menu to Cook' },
  { id: 'more_options', label: 'More Options' },
];
const MORE_OPTIONS_BUTTONS: SuggestedAction[] = [
  { id: 'weekly_plan', label: 'Weekly Meal Plan' },
  { id: 'weekly_grocery', label: 'View Weekly Grocery List' },
  { id: 'change_preference', label: 'Change Meal Preference' },
  { id: 'change_cook_number', label: "Change Cook's Number" },
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
      conversationState: 'awaiting_cook_number_onboarding',
    };
    return {
      response: {
        type: ResponseType.COOK_NUMBER_ONBOARDING_PROMPT,
        suggestedActions: SKIP_COOK_NUMBER_OPTION,
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
async function handleAwaitingCookNumberOnboarding(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
  const preferences = {
    cuisine: state.cuisinePreference ?? 'both',
    diet: state.dietPreference ?? 'veg',
    style: state.mealStyle ?? 'regular',
  };

  if (intent.intent === Intent.PROVIDE_COOK_NUMBER && intent.payload) {
    const validation = validatePhoneNumber(intent.payload);
    if (!validation.valid) {
      return {
        response: {
          type: ResponseType.INVALID_PHONE,
          suggestedActions: SKIP_COOK_NUMBER_OPTION,
        },
        updatedState: state,
      };
    }

    const candidateDishes = await generateCandidateDishes(
      deps,
      preferences,
      state.excludedDishIds ?? [],
    );

    const updatedState: UserState = {
      ...state,
      cookPhoneNumber: validation.normalized,
      onboardingComplete: true,
      conversationState: 'dish_preview',
      previewStep: 'breakfast',
      candidateDishes,
    };

    return {
      response: {
        type: ResponseType.DISH_PREVIEW,
        data: { candidateDishes, previewStep: 'breakfast' },
      },
      updatedState,
    };
  }

  if (intent.intent === Intent.SKIP_COOK_NUMBER) {
    const candidateDishes = await generateCandidateDishes(
      deps,
      preferences,
      state.excludedDishIds ?? [],
    );

    const updatedState: UserState = {
      ...state,
      onboardingComplete: true,
      conversationState: 'dish_preview',
      previewStep: 'breakfast',
      candidateDishes,
    };

    return {
      response: {
        type: ResponseType.DISH_PREVIEW,
        data: { candidateDishes, previewStep: 'breakfast' },
      },
      updatedState,
    };
  }

  // Unknown or invalid intent — re-prompt
  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: SKIP_COOK_NUMBER_OPTION,
    },
    updatedState: state,
  };
}

// --- Dish preview handler ---

async function handleDishPreview(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
  const preferences = {
    cuisine: state.cuisinePreference ?? 'both',
    diet: state.dietPreference ?? 'veg',
    style: state.mealStyle ?? 'regular',
  };

  // Defensive: if candidateDishes is missing, regenerate and start at first step
  if (!state.candidateDishes) {
    const candidateDishes = await generateCandidateDishes(
      deps,
      preferences,
      state.excludedDishIds ?? [],
    );
    const step: PreviewStep = 'breakfast';
    const updatedState: UserState = {
      ...state,
      candidateDishes,
      conversationState: 'dish_preview',
      previewStep: step,
    };
    return {
      response: {
        type: ResponseType.DISH_PREVIEW,
        data: { candidateDishes, previewStep: step },
      },
      updatedState,
    };
  }

  const currentStep = state.previewStep ?? 'breakfast';

  // Handle NEXT_CATEGORY — advance to next step
  if (intent.intent === Intent.NEXT_CATEGORY) {
    const currentIndex = PREVIEW_STEP_ORDER.indexOf(currentStep);
    const nextStep = PREVIEW_STEP_ORDER[currentIndex + 1] ?? 'confirm';

    if (nextStep === 'confirm') {
      // At confirm step, show full summary with confirm button
      return {
        response: {
          type: ResponseType.DISH_PREVIEW,
          data: { candidateDishes: state.candidateDishes, previewStep: 'confirm' },
        },
        updatedState: { ...state, previewStep: 'confirm' },
      };
    }

    return {
      response: {
        type: ResponseType.DISH_PREVIEW,
        data: { candidateDishes: state.candidateDishes, previewStep: nextStep },
      },
      updatedState: { ...state, previewStep: nextStep },
    };
  }

  if (intent.intent === Intent.REMOVE_DISH && intent.payload) {
    const dishId = intent.payload;

    // Check if it's a breakfast ID first — delegate to removeBreakfast
    const isBreakfast = state.candidateDishes.breakfasts.some(m => m.id === dishId);

    if (isBreakfast) {
      const result = await removeBreakfast(
        state.candidateDishes,
        dishId,
        deps,
        preferences,
        state.excludedDishIds ?? [],
      );

      // No replacement available — return current step unchanged
      if (!result) {
        return {
          response: {
            type: ResponseType.DISH_PREVIEW,
            data: { candidateDishes: state.candidateDishes, previewStep: currentStep },
          },
          updatedState: state,
        };
      }

      // Successful removal — update exclusion list and candidates
      const updatedExcluded = [...(state.excludedDishIds ?? []), dishId];
      const updatedState: UserState = {
        ...state,
        candidateDishes: result.updated,
        excludedDishIds: updatedExcluded,
      };
      return {
        response: {
          type: ResponseType.DISH_REMOVED,
          data: {
            candidateDishes: result.updated,
            removedDishName: result.removedName,
            replacementDishName: result.replacementName,
            previewStep: currentStep,
          },
        },
        updatedState,
      };
    }

    // Otherwise it's a component — delegate to removeComponent
    const componentResult = removeComponent(state.candidateDishes, dishId);

    if (!componentResult) {
      return {
        response: {
          type: ResponseType.DISH_PREVIEW_EMPTY_ERROR,
          data: { candidateDishes: state.candidateDishes, previewStep: currentStep },
        },
        updatedState: state,
      };
    }

    const updatedExcluded = [...(state.excludedDishIds ?? []), dishId];
    const updatedState: UserState = {
      ...state,
      candidateDishes: componentResult.candidates,
      excludedDishIds: updatedExcluded,
    };
    return {
      response: {
        type: ResponseType.DISH_REMOVED,
        data: {
          candidateDishes: componentResult.candidates,
          removedComponentName: componentResult.removedComponentName,
          removedComponentCategory: componentResult.removedComponentCategory,
          previewStep: currentStep,
        },
      },
      updatedState,
    };
  }

  if (intent.intent === Intent.CONFIRM_DISHES) {
    const weeklyPlan = buildPlanFromComponents(state.candidateDishes, {
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'both',
    });
    const weeklyPlanStartDate = getCurrentWeekMondayISO();
    const updatedState: UserState = {
      ...state,
      weeklyPlan,
      weeklyPlanStartDate,
      onboardingComplete: true,
      conversationState: 'main_menu',
      candidateDishes: undefined,
      previewStep: undefined,
    };
    return {
      response: {
        type: ResponseType.WEEKLY_PLAN,
        data: { weeklyPlan },
        suggestedActions: MAIN_MENU_OPTIONS,
      },
      updatedState,
    };
  }

  // Unknown intent in dish_preview — re-present current step
  return {
    response: {
      type: ResponseType.DISH_PREVIEW,
      data: { candidateDishes: state.candidateDishes, previewStep: currentStep },
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

// --- More options handler ---

async function handleMoreOptions(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
  const preferences = {
    cuisine: state.cuisinePreference ?? 'both',
    diet: state.dietPreference ?? 'veg',
    style: state.mealStyle ?? 'regular',
  };

  switch (intent.intent) {
    case Intent.GENERATE_PLAN: {
      // If a valid plan already exists, show it instead of regenerating
      if (state.weeklyPlan && state.weeklyPlanStartDate && !isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.WEEKLY_PLAN,
            data: { weeklyPlan: state.weeklyPlan },
            suggestedActions: MAIN_MENU_OPTIONS,
          },
          updatedState: { ...state, conversationState: 'main_menu' },
        };
      }
      // No plan exists — go through dish preview flow
      const candidateDishes = await generateCandidateDishes(
        deps,
        preferences,
        state.excludedDishIds ?? [],
      );
      const updatedState: UserState = {
        ...state,
        candidateDishes,
        conversationState: 'dish_preview',
        previewStep: 'breakfast',
      };
      return {
        response: {
          type: ResponseType.DISH_PREVIEW,
          data: { candidateDishes, previewStep: 'breakfast' },
        },
        updatedState,
      };
    }

    case Intent.VIEW_WEEKLY_GROCERY: {
      if (!state.weeklyPlan) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: MORE_OPTIONS_BUTTONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: MORE_OPTIONS_BUTTONS,
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
          suggestedActions: MORE_OPTIONS_BUTTONS,
        },
        updatedState: state,
      };
    }

    case Intent.CHANGE_PREFERENCE: {
      const updatedState: UserState = {
        ...state,
        excludedDishIds: [],
        isPreferenceChange: true,
        conversationState: 'awaiting_preference_cuisine',
      };
      return {
        response: {
          type: ResponseType.ONBOARDING_CUISINE_PROMPT,
          suggestedActions: CUISINE_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.CHANGE_COOK_NUMBER: {
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
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: MORE_OPTIONS_BUTTONS,
        },
        updatedState: state,
      };
    }
  }
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
      const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
      const candidateDishes = await generateCandidateDishes(
        deps,
        preferences,
        state.excludedDishIds ?? [],
      );
      const updatedState: UserState = {
        ...state,
        candidateDishes,
        conversationState: 'dish_preview',
        previewStep: 'breakfast',
      };
      return {
        response: {
          type: ResponseType.DISH_PREVIEW,
          data: { candidateDishes, previewStep: 'breakfast' },
        },
        updatedState,
      };
    }

    case Intent.MORE_OPTIONS: {
      const updatedState: UserState = {
        ...state,
        conversationState: 'more_options',
      };
      return {
        response: {
          type: ResponseType.MORE_OPTIONS_MENU,
          suggestedActions: MORE_OPTIONS_BUTTONS,
        },
        updatedState,
      };
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

// --- Preference change handlers ---

function handleAwaitingPreferenceCuisine(intent: UserIntent, state: UserState): BotResult {
  if (intent.intent === Intent.SELECT_CUISINE && intent.payload) {
    const updatedState: UserState = {
      ...state,
      cuisinePreference: intent.payload as UserState['cuisinePreference'],
      conversationState: 'awaiting_preference_diet',
      isPreferenceChange: true,
    };
    return {
      response: {
        type: ResponseType.ONBOARDING_DIET_PROMPT,
        suggestedActions: DIET_OPTIONS,
      },
      updatedState,
    };
  }

  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: CUISINE_OPTIONS,
    },
    updatedState: state,
  };
}

async function handleAwaitingPreferenceDiet(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  if (intent.intent === Intent.SELECT_DIET && intent.payload) {
    const updatedDietState: UserState = {
      ...state,
      dietPreference: intent.payload as UserState['dietPreference'],
      excludedDishIds: [],
    };

    const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
    const preferences = {
      cuisine: updatedDietState.cuisinePreference ?? 'both',
      diet: updatedDietState.dietPreference ?? 'veg',
      style: updatedDietState.mealStyle ?? 'regular',
    };

    const candidateDishes = await generateCandidateDishes(deps, preferences, []);
    const updatedState: UserState = {
      ...updatedDietState,
      candidateDishes,
      conversationState: 'dish_preview',
      previewStep: 'breakfast',
      isPreferenceChange: false,
    };

    return {
      response: {
        type: ResponseType.DISH_PREVIEW,
        data: { candidateDishes, previewStep: 'breakfast' },
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

    case 'awaiting_cook_number_onboarding':
      return handleAwaitingCookNumberOnboarding(intent, userState, mealRepository, mealComponentRepository);

    case 'dish_preview':
      return handleDishPreview(intent, userState, mealRepository, mealComponentRepository);

    case 'main_menu':
      return handleMainMenu(intent, userState, mealRepository, mealComponentRepository);

    case 'more_options':
      return handleMoreOptions(intent, userState, mealRepository, mealComponentRepository);

    case 'awaiting_preference_cuisine':
      return handleAwaitingPreferenceCuisine(intent, userState);

    case 'awaiting_preference_diet':
      return handleAwaitingPreferenceDiet(intent, userState, mealRepository, mealComponentRepository);

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
  MORE_OPTIONS_BUTTONS,
  SKIP_COOK_NUMBER_OPTION,
  createDefaultState,
  getComingMondayISO,
  getCurrentWeekMondayISO,
  getTomorrowIndex,
  isLegacyPlan,
};
