// BotEngine — intent-based conversation engine
// Zero imports from adapters, WhatsApp, Twilio, or AWS modules

import type { MealRepository, MealComponentRepository, RulesRepository } from './ports';
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
import { generateWeeklyPlan, extractTomorrowPlan, swapTomorrowLunch, generateAlternatives, regenerateWeeklyPlan } from './planGenerator';
import { generateGroceryList } from './groceryListGenerator';
import { validatePhoneNumber } from './phoneValidation';
import { generateCandidateDishes, removeBreakfast, removeComponent, buildPlanFromComponents, hasMinimumComponents, type DishPreviewDeps } from './dishPreview';
import { MealSelector } from './mealSelector';

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

const WEEKLY_PLAN_OPTIONS: SuggestedAction[] = [
  { id: 'happy_with_menu', label: 'Happy with the menu' },
  { id: 'change_plan', label: 'Want to change' },
];

const HAPPY_MENU_OPTIONS: SuggestedAction[] = [
  { id: 'tomorrow_plan', label: "What's for tomorrow?" },
  { id: 'weekly_grocery', label: 'Get the grocery list' },
];
const CHANGE_PLAN_OPTIONS: SuggestedAction[] = [
  { id: 'few_meals', label: 'Change a Few Meals' },
  { id: 'entire_plan', label: 'Regenerate Plan' },
  { id: 'change_preference', label: 'Change Preferences' },
];

const DAY_SELECT_OPTIONS: SuggestedAction[] = [
  { id: 'day_0', label: 'Monday' },
  { id: 'day_1', label: 'Tuesday' },
  { id: 'day_2', label: 'Wednesday' },
  { id: 'day_3', label: 'Thursday' },
  { id: 'day_4', label: 'Friday' },
  { id: 'day_5', label: 'Saturday' },
  { id: 'day_6', label: 'Sunday' },
];

const SLOT_SELECT_OPTIONS: SuggestedAction[] = [
  { id: 'slot_breakfast', label: 'Breakfast' },
  { id: 'slot_lunch', label: 'Lunch' },
  { id: 'slot_dinner', label: 'Dinner' },
];

const ENTIRE_PLAN_OPTIONS: SuggestedAction[] = [
  { id: 'accept_plan', label: 'Accept Plan' },
  { id: 'retry_plan', label: 'Retry' },
];

const FEW_MEALS_DONE_OPTIONS: SuggestedAction[] = [
  { id: 'change_more', label: 'Change More Meals' },
  { id: 'done_changing', label: 'Done' },
];

const ADHOC_MENU_OPTIONS: SuggestedAction[] = [
  { id: 'weekly_plan', label: 'Weekly Meal Plan' },
  { id: 'tomorrow_plan', label: "Tomorrow's Plan" },
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

async function handleAwaitingMealStyle(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
  mealSelector?: MealSelector,
): Promise<BotResult> {
  if (intent.intent === Intent.SELECT_MEAL_STYLE && intent.payload) {
    const preferences = {
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'veg',
      style: intent.payload as string,
    };
    console.log('[botEngine] handleAwaitingMealStyle preferences:', JSON.stringify(preferences));
    const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
    const candidateDishes = await generateCandidateDishes(
      deps,
      preferences,
      state.excludedDishIds ?? [],
      mealSelector,
    );
    console.log('[botEngine] candidateDishes: breakfasts=%d, lunchCats=%s, dinnerCats=%s',
      candidateDishes.breakfasts.length,
      Object.entries(candidateDishes.lunchComponents).map(([k, v]) => `${k}:${(v as any[]).length}`).join(','),
      Object.entries(candidateDishes.dinnerComponents).map(([k, v]) => `${k}:${(v as any[]).length}`).join(','),
    );

    // Build weekly plan directly from candidates — no dish review step
    const weeklyPlan = buildPlanFromComponents(candidateDishes, {
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'both',
    });
    const weeklyPlanStartDate = getCurrentWeekMondayISO();

    const updatedState: UserState = {
      ...state,
      mealStyle: intent.payload as UserState['mealStyle'],
      onboardingComplete: true,
      conversationState: 'main_menu',
      weeklyPlan,
      weeklyPlanStartDate,
      candidateDishes: undefined,
      previewStep: undefined,
    };

    return {
      response: {
        type: ResponseType.WEEKLY_PLAN,
        data: { weeklyPlan },
        suggestedActions: WEEKLY_PLAN_OPTIONS,
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
  mealSelector?: MealSelector,
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
      mealSelector,
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
      mealSelector,
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
  mealSelector?: MealSelector,
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
      mealSelector,
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

  // Handle REMOVE_DISHES — batch removal of multiple items
  if (intent.intent === Intent.REMOVE_DISHES && intent.payload) {
    const dishIds = intent.payload.split(',');
    let currentCandidates = state.candidateDishes;
    let currentExcluded = state.excludedDishIds ?? [];
    const removedNames: string[] = [];

    for (const dishId of dishIds) {
      const isBreakfast = currentCandidates.breakfasts.some(m => m.id === dishId);

      if (isBreakfast) {
        const result = await removeBreakfast(
          currentCandidates,
          dishId,
          deps,
          preferences,
          currentExcluded,
        );
        if (result) {
          currentCandidates = result.updated;
          currentExcluded = [...currentExcluded, dishId];
          removedNames.push(result.removedName);
        }
      } else {
        const componentResult = removeComponent(currentCandidates, dishId);
        if (componentResult) {
          currentCandidates = componentResult.candidates;
          currentExcluded = [...currentExcluded, dishId];
          removedNames.push(componentResult.removedComponentName);
        }
      }
    }

    if (removedNames.length === 0) {
      return {
        response: {
          type: ResponseType.DISH_PREVIEW_EMPTY_ERROR,
          data: { candidateDishes: state.candidateDishes, previewStep: currentStep },
        },
        updatedState: state,
      };
    }

    const updatedState: UserState = {
      ...state,
      candidateDishes: currentCandidates,
      excludedDishIds: currentExcluded,
    };
    return {
      response: {
        type: ResponseType.DISH_REMOVED,
        data: {
          candidateDishes: currentCandidates,
          removedComponentName: removedNames.join(', '),
          removedComponentCategory: 'items',
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
        suggestedActions: WEEKLY_PLAN_OPTIONS,
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

// --- Main menu intent handler ---

async function handleMainMenu(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
  mealSelector?: MealSelector,
): Promise<BotResult> {
  const preferences = {
    cuisine: state.cuisinePreference ?? 'both',
    diet: state.dietPreference ?? 'veg',
    style: state.mealStyle ?? 'regular',
  };

  switch (intent.intent) {
    case Intent.GENERATE_PLAN: {
      // If a valid plan already exists, show it
      if (state.weeklyPlan && state.weeklyPlanStartDate && !isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.WEEKLY_PLAN,
            data: { weeklyPlan: state.weeklyPlan },
            suggestedActions: WEEKLY_PLAN_OPTIONS,
          },
          updatedState: state,
        };
      }
      // No plan exists — generate one via dish preview
      const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
      const candidateDishes = await generateCandidateDishes(
        deps,
        preferences,
        state.excludedDishIds ?? [],
        mealSelector,
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

    case Intent.HAPPY_WITH_MENU: {
      // Enter sequential happy flow: weekly grocery prompt → daily flow
      return {
        response: {
          type: ResponseType.HAPPY_GROCERY_PROMPT,
        },
        updatedState: { ...state, conversationState: 'happy_grocery_prompt' },
      };
    }

    case Intent.VIEW_WEEKLY_GROCERY: {
      if (!state.weeklyPlan) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
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
          suggestedActions: ADHOC_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    case Intent.VIEW_TOMORROW_PLAN: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const dayPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
      if (!dayPlan) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      // Enter the sequential daily flow: menu → grocery prompt → cook prompt
      const updatedState: UserState = {
        ...state,
        conversationState: 'daily_grocery_prompt',
      };
      return {
        response: {
          type: ResponseType.DAILY_REMINDER,
          data: { dayPlan },
        },
        updatedState,
      };
    }

    case Intent.VIEW_TOMORROW_GROCERY: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      const tomorrowPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
      if (!tomorrowPlan) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
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
        },
        updatedState: { ...state, conversationState: 'daily_cook_prompt' },
      };
    }

    case Intent.SEND_MENU_TO_COOK: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (!state.cookPhoneNumber) {
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
      const cookDayPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
      if (!cookDayPlan) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      return {
        response: {
          type: ResponseType.COOK_MESSAGE_SENT,
          data: { dayPlan: cookDayPlan, cookNumber: state.cookPhoneNumber },
          suggestedActions: ADHOC_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    case Intent.SWAP_LUNCH: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: state,
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
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
            suggestedActions: ADHOC_MENU_OPTIONS,
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
          suggestedActions: ADHOC_MENU_OPTIONS,
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

    case Intent.CHANGE_PLAN: {
      const updatedState: UserState = {
        ...state,
        conversationState: 'change_plan_menu',
      };
      return {
        response: {
          type: ResponseType.CHANGE_PLAN_MENU,
          suggestedActions: CHANGE_PLAN_OPTIONS,
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

    case Intent.ADHOC_MENU: {
      return {
        response: {
          type: ResponseType.ADHOC_MENU,
          data: { weeklyPlan: state.weeklyPlan },
          suggestedActions: ADHOC_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }

    default: {
      // UNKNOWN or any unrecognized intent
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: ADHOC_MENU_OPTIONS,
        },
        updatedState: state,
      };
    }
  }
}

// --- Change Plan Menu handler (Task 3.1) ---

async function handleChangePlanMenu(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  switch (intent.intent) {
    case Intent.CHANGE_TOMORROW_MEALS: {
      if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: { ...state, conversationState: 'main_menu' },
        };
      }
      if (isLegacyPlan(state.weeklyPlan)) {
        return {
          response: {
            type: ResponseType.EXPIRED_PLAN_PROMPT,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: { ...state, conversationState: 'main_menu' },
        };
      }
      const tomorrowDay = getTomorrowIndex(state.weeklyPlanStartDate);
      const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const updatedState: UserState = {
        ...state,
        fewMealsSelectedDay: tomorrowDay,
        conversationState: 'few_meals_slot_select',
      };
      return {
        response: {
          type: ResponseType.FEW_MEALS_SLOT_PROMPT,
          data: { dayName: DAY_NAMES[tomorrowDay] },
          suggestedActions: SLOT_SELECT_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.CHANGE_FEW_MEALS: {
      const updatedState: UserState = {
        ...state,
        conversationState: 'few_meals_day_select',
      };
      return {
        response: {
          type: ResponseType.FEW_MEALS_DAY_PROMPT,
          suggestedActions: DAY_SELECT_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.CHANGE_ENTIRE_PLAN: {
      if (!state.weeklyPlan) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: { ...state, conversationState: 'main_menu' },
        };
      }

      const preferences = {
        cuisine: state.cuisinePreference ?? 'both',
        diet: state.dietPreference ?? 'veg',
        style: state.mealStyle ?? 'regular',
      };
      const meals = await mealRepository.getMeals({
        cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
        diet: preferences.diet as 'veg' | 'non_veg' | 'both',
        style: preferences.style as 'health' | 'regular',
      });
      const components = await mealComponentRepository.getComponents({
        cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
      });

      const newPlan = regenerateWeeklyPlan(state.weeklyPlan, meals, components, preferences);
      const weeklyPlanStartDate = getCurrentWeekMondayISO();

      const updatedState: UserState = {
        ...state,
        previousWeeklyPlan: state.weeklyPlan,
        weeklyPlan: newPlan,
        weeklyPlanStartDate,
        conversationState: 'entire_plan_confirm',
      };
      return {
        response: {
          type: ResponseType.ENTIRE_PLAN_PREVIEW,
          data: { weeklyPlan: newPlan },
          suggestedActions: ENTIRE_PLAN_OPTIONS,
        },
        updatedState,
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

    default:
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: CHANGE_PLAN_OPTIONS,
        },
        updatedState: state,
      };
  }
}

// --- Few Meals Day Select handler (Task 3.2) ---

function handleFewMealsDaySelect(intent: UserIntent, state: UserState): BotResult {
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (intent.intent === Intent.SELECT_DAY && intent.payload != null) {
    const day = parseInt(intent.payload, 10);
    if (day >= 0 && day <= 6) {
      const updatedState: UserState = {
        ...state,
        fewMealsSelectedDay: day,
        conversationState: 'few_meals_slot_select',
      };
      return {
        response: {
          type: ResponseType.FEW_MEALS_SLOT_PROMPT,
          data: { dayName: DAY_NAMES[day] },
          suggestedActions: SLOT_SELECT_OPTIONS,
        },
        updatedState,
      };
    }
  }

  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: DAY_SELECT_OPTIONS,
    },
    updatedState: state,
  };
}

// --- Few Meals Slot Select handler (Task 3.3) ---

async function handleFewMealsSlotSelect(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  if (intent.intent === Intent.SELECT_MEAL_SLOT && intent.payload) {
    const slot = intent.payload as 'breakfast' | 'lunch' | 'dinner';
    if (slot !== 'breakfast' && slot !== 'lunch' && slot !== 'dinner') {
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: SLOT_SELECT_OPTIONS,
        },
        updatedState: state,
      };
    }

    if (!state.weeklyPlan || state.fewMealsSelectedDay == null) {
      return {
        response: {
          type: ResponseType.NO_PLAN_ERROR,
          suggestedActions: ADHOC_MENU_OPTIONS,
        },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }

    const meals = await mealRepository.getMeals({
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'veg',
      style: state.mealStyle ?? 'regular',
    });
    const components = await mealComponentRepository.getComponents({
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'veg',
      style: state.mealStyle ?? 'regular',
    });
    const preferences = {
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'veg',
      style: state.mealStyle ?? 'regular',
    };

    const alternatives = generateAlternatives(
      state.weeklyPlan,
      state.fewMealsSelectedDay,
      slot,
      meals,
      components,
      preferences,
      3,
    );

    if (alternatives.length === 0) {
      return {
        response: {
          type: ResponseType.FEW_MEALS_NO_ALTERNATIVE,
          suggestedActions: DAY_SELECT_OPTIONS,
        },
        updatedState: { ...state, conversationState: 'few_meals_day_select' },
      };
    }

    const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const altActions: SuggestedAction[] = alternatives.map((alt, i) => ({
      id: `alt_${i}`,
      label: alt.name,
    }));

    const updatedState: UserState = {
      ...state,
      fewMealsSelectedSlot: slot,
      fewMealsAlternatives: alternatives,
      conversationState: 'few_meals_alternatives',
    };

    return {
      response: {
        type: ResponseType.FEW_MEALS_ALTERNATIVES,
        data: { dayName: DAY_NAMES[state.fewMealsSelectedDay], oldMeal: slot },
        suggestedActions: altActions,
      },
      updatedState,
    };
  }

  return {
    response: {
      type: ResponseType.INVALID_INPUT,
      suggestedActions: SLOT_SELECT_OPTIONS,
    },
    updatedState: state,
  };
}

// --- Few Meals Alternatives handler (Task 3.4) ---

function handleFewMealsAlternatives(intent: UserIntent, state: UserState): BotResult {
  switch (intent.intent) {
    case Intent.SELECT_ALTERNATIVE: {
      if (!intent.payload || !state.weeklyPlan || state.fewMealsSelectedDay == null || !state.fewMealsSelectedSlot || !state.fewMealsAlternatives) {
        return {
          response: {
            type: ResponseType.INVALID_INPUT,
            suggestedActions: FEW_MEALS_DONE_OPTIONS,
          },
          updatedState: state,
        };
      }

      const altIndex = parseInt(intent.payload, 10);
      if (isNaN(altIndex) || altIndex < 0 || altIndex >= state.fewMealsAlternatives.length) {
        return {
          response: {
            type: ResponseType.INVALID_INPUT,
            suggestedActions: FEW_MEALS_DONE_OPTIONS,
          },
          updatedState: state,
        };
      }

      const selectedAlt = state.fewMealsAlternatives[altIndex];
      const dayIndex = state.fewMealsSelectedDay;
      const slot = state.fewMealsSelectedSlot;

      // Deep-clone the plan
      const updatedPlan = state.weeklyPlan.map((day) => ({
        ...day,
        breakfast: { ...day.breakfast },
        lunch: { ...day.lunch },
        dinner: { ...day.dinner },
      }));

      // Update the selected day/slot
      updatedPlan[dayIndex] = {
        ...updatedPlan[dayIndex],
        [slot]: selectedAlt,
      };

      const updatedState: UserState = {
        ...state,
        weeklyPlan: updatedPlan,
        fewMealsAlternatives: undefined,
        conversationState: 'few_meals_alternatives',
      };

      return {
        response: {
          type: ResponseType.FEW_MEALS_UPDATED,
          suggestedActions: FEW_MEALS_DONE_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.CHANGE_MORE_MEALS: {
      const updatedState: UserState = {
        ...state,
        fewMealsSelectedDay: undefined,
        fewMealsSelectedSlot: undefined,
        fewMealsAlternatives: undefined,
        conversationState: 'few_meals_day_select',
      };
      return {
        response: {
          type: ResponseType.FEW_MEALS_DAY_PROMPT,
          suggestedActions: DAY_SELECT_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.DONE_CHANGING: {
      const updatedState: UserState = {
        ...state,
        fewMealsSelectedDay: undefined,
        fewMealsSelectedSlot: undefined,
        fewMealsAlternatives: undefined,
        conversationState: 'main_menu',
      };
      return {
        response: {
          type: ResponseType.WEEKLY_PLAN,
          data: { weeklyPlan: updatedState.weeklyPlan },
          suggestedActions: WEEKLY_PLAN_OPTIONS,
        },
        updatedState,
      };
    }

    default:
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: FEW_MEALS_DONE_OPTIONS,
        },
        updatedState: state,
      };
  }
}

// --- Entire Plan Confirm handler (Task 3.5) ---

async function handleEntirePlanConfirm(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
): Promise<BotResult> {
  switch (intent.intent) {
    case Intent.ACCEPT_PLAN: {
      const updatedState: UserState = {
        ...state,
        previousWeeklyPlan: undefined,
        conversationState: 'main_menu',
      };
      return {
        response: {
          type: ResponseType.WEEKLY_PLAN,
          data: { weeklyPlan: state.weeklyPlan },
          suggestedActions: WEEKLY_PLAN_OPTIONS,
        },
        updatedState,
      };
    }

    case Intent.RETRY_PLAN: {
      const currentPlan = state.weeklyPlan ?? state.previousWeeklyPlan;
      if (!currentPlan) {
        return {
          response: {
            type: ResponseType.NO_PLAN_ERROR,
            suggestedActions: ADHOC_MENU_OPTIONS,
          },
          updatedState: { ...state, conversationState: 'main_menu' },
        };
      }

      const preferences = {
        cuisine: state.cuisinePreference ?? 'both',
        diet: state.dietPreference ?? 'veg',
        style: state.mealStyle ?? 'regular',
      };
      const meals = await mealRepository.getMeals({
        cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
        diet: preferences.diet as 'veg' | 'non_veg' | 'both',
        style: preferences.style as 'health' | 'regular',
      });
      const components = await mealComponentRepository.getComponents({
        cuisine: preferences.cuisine as 'north_indian' | 'south_indian' | 'both',
      });

      const newPlan = regenerateWeeklyPlan(currentPlan, meals, components, preferences);
      const weeklyPlanStartDate = getCurrentWeekMondayISO();

      const updatedState: UserState = {
        ...state,
        weeklyPlan: newPlan,
        weeklyPlanStartDate,
        conversationState: 'entire_plan_confirm',
      };

      return {
        response: {
          type: ResponseType.ENTIRE_PLAN_PREVIEW,
          data: { weeklyPlan: newPlan },
          suggestedActions: ENTIRE_PLAN_OPTIONS,
        },
        updatedState,
      };
    }

    default:
      return {
        response: {
          type: ResponseType.INVALID_INPUT,
          suggestedActions: ENTIRE_PLAN_OPTIONS,
        },
        updatedState: state,
      };
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
  mealSelector?: MealSelector,
): Promise<BotResult> {
  if (intent.intent === Intent.SELECT_DIET && intent.payload) {
    const updatedState: UserState = {
      ...state,
      dietPreference: intent.payload as UserState['dietPreference'],
      excludedDishIds: [],
      conversationState: 'awaiting_preference_style',
      isPreferenceChange: true,
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


// --- Handle preference style selection (change preferences flow) ---

async function handleAwaitingPreferenceStyle(
  intent: UserIntent,
  state: UserState,
  mealRepository: MealRepository,
  mealComponentRepository: MealComponentRepository,
  mealSelector?: MealSelector,
): Promise<BotResult> {
  if (intent.intent === Intent.SELECT_MEAL_STYLE && intent.payload) {
    const style = intent.payload as UserState['mealStyle'];
    const preferences = {
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'veg',
      style: style ?? 'regular',
    };
    console.log('[botEngine] handleAwaitingPreferenceStyle preferences:', JSON.stringify(preferences));

    const deps: DishPreviewDeps = { mealRepository, mealComponentRepository };
    const candidateDishes = await generateCandidateDishes(
      deps,
      preferences,
      [],
      mealSelector,
    );

    const weeklyPlan = buildPlanFromComponents(candidateDishes, {
      cuisine: state.cuisinePreference ?? 'both',
      diet: state.dietPreference ?? 'both',
    });
    const weeklyPlanStartDate = getCurrentWeekMondayISO();

    const updatedState: UserState = {
      ...state,
      mealStyle: style,
      weeklyPlan,
      weeklyPlanStartDate,
      excludedDishIds: [],
      candidateDishes: undefined,
      previewStep: undefined,
      isPreferenceChange: false,
      conversationState: 'main_menu',
    };

    return {
      response: {
        type: ResponseType.WEEKLY_PLAN,
        data: { weeklyPlan },
        suggestedActions: WEEKLY_PLAN_OPTIONS,
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


// --- Happy menu flow handler ---

function handleHappyGroceryPrompt(
  intent: UserIntent,
  state: UserState,
): BotResult {
  if (intent.intent === Intent.HAPPY_GROCERY_YES) {
    // Show weekly grocery list, then transition to daily flow
    if (!state.weeklyPlan) {
      return {
        response: { type: ResponseType.NO_PLAN_ERROR, suggestedActions: ADHOC_MENU_OPTIONS },
        updatedState: { ...state, conversationState: 'main_menu' },
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
      },
      // After showing weekly grocery, ask if user wants to continue to daily flow
      updatedState: { ...state, conversationState: 'happy_daily_prompt' },
    };
  }

  if (intent.intent === Intent.HAPPY_GROCERY_NO) {
    // Skip weekly grocery, ask if user wants to see tomorrow's plan
    return {
      response: { type: ResponseType.HAPPY_DAILY_PROMPT },
      updatedState: { ...state, conversationState: 'happy_daily_prompt' },
    };
  }

  // Invalid input — re-prompt
  return {
    response: { type: ResponseType.INVALID_INPUT },
    updatedState: state,
  };
}

// --- Happy daily prompt handler ---

function handleHappyDailyPrompt(
  intent: UserIntent,
  state: UserState,
): BotResult {
  if (intent.intent === Intent.HAPPY_DAILY_YES) {
    // Enter daily flow — show tomorrow's menu + grocery prompt
    if (!state.weeklyPlan || !state.weeklyPlanStartDate || isLegacyPlan(state.weeklyPlan)) {
      return {
        response: { type: ResponseType.DAILY_FLOW_DONE },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }
    const dayPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
    if (!dayPlan) {
      return {
        response: { type: ResponseType.DAILY_FLOW_DONE },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }
    return {
      response: {
        type: ResponseType.DAILY_REMINDER,
        data: { dayPlan },
      },
      updatedState: { ...state, conversationState: 'daily_grocery_prompt' },
    };
  }

  if (intent.intent === Intent.HAPPY_DAILY_NO) {
    // Terminal — done
    return {
      response: { type: ResponseType.DAILY_FLOW_DONE },
      updatedState: { ...state, conversationState: 'main_menu' },
    };
  }

  // Invalid input — re-prompt
  return {
    response: { type: ResponseType.INVALID_INPUT },
    updatedState: state,
  };
}

// --- Daily flow handlers ---

function handleDailyGroceryPrompt(
  intent: UserIntent,
  state: UserState,
): BotResult {
  if (intent.intent === Intent.DAILY_GROCERY_YES) {
    // Show grocery list, then move to cook prompt
    if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
      return {
        response: { type: ResponseType.NO_PLAN_ERROR, suggestedActions: ADHOC_MENU_OPTIONS },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }
    const tomorrowPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
    if (!tomorrowPlan) {
      return {
        response: { type: ResponseType.EXPIRED_PLAN_PROMPT, suggestedActions: ADHOC_MENU_OPTIONS },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }
    const tomorrowMeals: (Meal | ComposedMeal)[] = [tomorrowPlan.breakfast, tomorrowPlan.lunch, tomorrowPlan.dinner];
    const groceryList = generateGroceryList(tomorrowMeals);
    return {
      response: {
        type: ResponseType.TOMORROW_GROCERY_LIST,
        data: { groceryList },
      },
      updatedState: { ...state, conversationState: 'daily_cook_prompt' },
    };
  }

  if (intent.intent === Intent.DAILY_GROCERY_NO) {
    // Skip grocery, go straight to cook prompt
    return {
      response: { type: ResponseType.DAILY_COOK_PROMPT },
      updatedState: { ...state, conversationState: 'daily_cook_prompt' },
    };
  }

  // Invalid input — re-prompt
  return {
    response: { type: ResponseType.INVALID_INPUT },
    updatedState: state,
  };
}

function handleDailyCookPrompt(
  intent: UserIntent,
  state: UserState,
): BotResult {
  if (intent.intent === Intent.DAILY_COOK_YES) {
    // User wants to send to cook
    if (!state.cookPhoneNumber) {
      return {
        response: { type: ResponseType.COOK_NUMBER_PROMPT },
        updatedState: { ...state, conversationState: 'awaiting_cook_number' },
      };
    }
    if (!state.weeklyPlan || !state.weeklyPlanStartDate) {
      return {
        response: { type: ResponseType.NO_PLAN_ERROR, suggestedActions: ADHOC_MENU_OPTIONS },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }
    const cookDayPlan = extractTomorrowPlan(state.weeklyPlan, state.weeklyPlanStartDate);
    if (!cookDayPlan) {
      return {
        response: { type: ResponseType.EXPIRED_PLAN_PROMPT, suggestedActions: ADHOC_MENU_OPTIONS },
        updatedState: { ...state, conversationState: 'main_menu' },
      };
    }
    return {
      response: {
        type: ResponseType.COOK_MESSAGE_SENT,
        data: { dayPlan: cookDayPlan, cookNumber: state.cookPhoneNumber },
      },
      updatedState: { ...state, conversationState: 'main_menu' },
    };
  }

  if (intent.intent === Intent.DAILY_COOK_NO) {
    // Done — terminal with daily reminder hint
    return {
      response: { type: ResponseType.DAILY_FLOW_DONE },
      updatedState: { ...state, conversationState: 'main_menu' },
    };
  }

  // Invalid input — re-prompt
  return {
    response: { type: ResponseType.INVALID_INPUT },
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
  rulesRepository?: RulesRepository,
): Promise<BotResult> {
  // Create MealSelector when a RulesRepository is provided
  const mealSelector = rulesRepository
    ? new MealSelector(rulesRepository, mealRepository, mealComponentRepository)
    : undefined;

  // New user — no state exists
  if (!userState) {
    return handleNewUser(phoneNumber ?? 'unknown');
  }

  // Global adhoc menu — "hi"/"menu" from any state resets to main_menu for onboarded users
  if (intent.intent === Intent.ADHOC_MENU && userState.onboardingComplete) {
    const mainMenuState: UserState = {
      ...userState,
      conversationState: 'main_menu',
      candidateDishes: undefined,
      previewStep: undefined,
      fewMealsSelectedDay: undefined,
      fewMealsSelectedSlot: undefined,
      fewMealsAlternatives: undefined,
      previousWeeklyPlan: undefined,
    };
    return {
      response: {
        type: ResponseType.ADHOC_MENU,
        data: { weeklyPlan: userState.weeklyPlan },
        suggestedActions: ADHOC_MENU_OPTIONS,
      },
      updatedState: mainMenuState,
    };
  }

  // Route by conversation state
  switch (userState.conversationState) {
    case 'awaiting_cuisine':
      return handleAwaitingCuisine(intent, userState);

    case 'awaiting_diet':
      return handleAwaitingDiet(intent, userState);

    case 'awaiting_meal_style':
      return handleAwaitingMealStyle(intent, userState, mealRepository, mealComponentRepository, mealSelector);

    case 'awaiting_cook_number_onboarding':
      return handleAwaitingCookNumberOnboarding(intent, userState, mealRepository, mealComponentRepository, mealSelector);

    case 'dish_preview':
      return handleDishPreview(intent, userState, mealRepository, mealComponentRepository, mealSelector);

    case 'main_menu':
      return handleMainMenu(intent, userState, mealRepository, mealComponentRepository, mealSelector);

    case 'awaiting_preference_cuisine':
      return handleAwaitingPreferenceCuisine(intent, userState);

    case 'awaiting_preference_diet':
      return handleAwaitingPreferenceDiet(intent, userState, mealRepository, mealComponentRepository, mealSelector);

    case 'awaiting_preference_style':
      return handleAwaitingPreferenceStyle(intent, userState, mealRepository, mealComponentRepository, mealSelector);

    case 'change_plan_menu':
      return handleChangePlanMenu(intent, userState, mealRepository, mealComponentRepository);

    case 'few_meals_day_select':
      return handleFewMealsDaySelect(intent, userState);

    case 'few_meals_slot_select':
      return handleFewMealsSlotSelect(intent, userState, mealRepository, mealComponentRepository);

    case 'few_meals_alternatives':
      return handleFewMealsAlternatives(intent, userState);

    case 'entire_plan_confirm':
      return handleEntirePlanConfirm(intent, userState, mealRepository, mealComponentRepository);

    case 'daily_grocery_prompt':
      return handleDailyGroceryPrompt(intent, userState);

    case 'daily_cook_prompt':
      return handleDailyCookPrompt(intent, userState);

    case 'happy_grocery_prompt':
      return handleHappyGroceryPrompt(intent, userState);

    case 'happy_daily_prompt':
      return handleHappyDailyPrompt(intent, userState);

    case 'awaiting_cook_number': {
      if (intent.intent === Intent.PROVIDE_COOK_NUMBER && intent.payload) {
        const validation = validatePhoneNumber(intent.payload);
        if (validation.valid) {
          const stateWithCook: UserState = {
            ...userState,
            cookPhoneNumber: validation.normalized,
            conversationState: 'main_menu',
          };

          // If a plan exists, send the menu to the cook immediately
          if (stateWithCook.weeklyPlan && stateWithCook.weeklyPlanStartDate && !isLegacyPlan(stateWithCook.weeklyPlan)) {
            const cookDayPlan = extractTomorrowPlan(stateWithCook.weeklyPlan, stateWithCook.weeklyPlanStartDate);
            if (cookDayPlan) {
              return {
                response: {
                  type: ResponseType.COOK_MESSAGE_SENT,
                  data: { dayPlan: cookDayPlan, cookNumber: validation.normalized },
                },
                updatedState: stateWithCook,
              };
            }
          }

          // No plan or expired — just confirm the number was saved
          return {
            response: {
              type: ResponseType.COOK_NUMBER_SAVED,
              data: { cookNumber: validation.normalized },
            },
            updatedState: stateWithCook,
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
          suggestedActions: ADHOC_MENU_OPTIONS,
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
  WEEKLY_PLAN_OPTIONS,
  HAPPY_MENU_OPTIONS,
  SKIP_COOK_NUMBER_OPTION,
  CHANGE_PLAN_OPTIONS,
  DAY_SELECT_OPTIONS,
  SLOT_SELECT_OPTIONS,
  ENTIRE_PLAN_OPTIONS,
  FEW_MEALS_DONE_OPTIONS,
  ADHOC_MENU_OPTIONS,
  createDefaultState,
  getComingMondayISO,
  getCurrentWeekMondayISO,
  getTomorrowIndex,
  isLegacyPlan,
};
