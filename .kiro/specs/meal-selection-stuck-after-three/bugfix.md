# Bugfix Requirements Document

## Introduction

Users are unable to proceed past step 3 of 5 (Gravy) in the dish preview flow. The dish preview flow presents meal selections in 5 sequential steps (Breakfast → Base → Gravy → Dry Veggie → Side), each with a "Next ➡️" button to advance. After completing step 3, users cannot advance to step 4 (Dry Veggie) or step 5 (Side).

The root cause is a conflict between numbered list items and the numbered button fallback in the WhatsApp message rendering. When the WhatsApp quick-reply template creation fails (e.g., body text exceeds the 1024-character limit for interactive messages — more likely at step 3/Gravy due to larger component pools), the "Next ➡️" button falls back to numbered text rendered as "1. Next ➡️". However, the message body already contains numbered list items for dish removal (e.g., "1. Paneer Butter Masala", "2. Dal Makhani", etc.). This creates two conflicting numbered lists. When the user types "1" intending to select "Next ➡️", the `resolveNumberedInput` function resolves it to the first list item (`remove_dish_xxx`) instead of `next_category`, triggering a dish removal instead of advancing the step. The user has no way to determine the correct number to type for "Next" because the fallback numbering restarts at 1 while `lastButtonIds` stores list item IDs first, followed by button IDs.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the WhatsApp quick-reply template creation fails during a dish preview step that has list items (removable dishes) AND the "Next ➡️" button falls back to numbered text, THEN the system renders "1. Next ➡️" at the end of the message body which already contains a separate numbered list of removable items, creating two conflicting numbered lists

1.2 WHEN the user types "1" in response to the fallback "1. Next ➡️" text during a dish preview step with list items, THEN the system resolves the input to the first list item ID (`remove_dish_xxx`) instead of `next_category`, because `lastButtonIds` stores list item IDs before button IDs and `resolveNumberedInput` uses a single flat index

1.3 WHEN the dish preview step body text exceeds the WhatsApp interactive message character limit (1024 chars) — which is more likely at step 3/5 (Gravy) due to larger component pools with both lunch and dinner items — THEN the quick-reply template creation fails silently and falls back to numbered text, making the "Next ➡️" button unreachable via the displayed numbering

1.4 WHEN the user is in the `dish_preview` conversation state and types free text that is not a number matching a `lastButtonIds` entry (e.g., "next", "continue", "skip"), THEN the system returns `Intent.UNKNOWN` because the `intentMapper` has no free-text handling for the `dish_preview` state, and the user is re-presented with the same step without advancing

### Expected Behavior (Correct)

2.1 WHEN the "Next ➡️" button falls back to numbered text during a dish preview step with list items, THEN the system SHALL render the button number as a continuation of the list item numbering (e.g., if there are 5 list items, "Next ➡️" should be "6. Next ➡️") so that the displayed number matches the `lastButtonIds` index

2.2 WHEN the user types the correct number corresponding to the "Next ➡️" button position in `lastButtonIds`, THEN the system SHALL resolve the input to `next_category` and advance to the next dish preview step

2.3 WHEN the dish preview step body text is long, THEN the system SHALL ensure the "Next ➡️" action remains accessible to the user, either by keeping the quick-reply template within character limits or by providing a clear and unambiguous fallback numbering

2.4 WHEN the user is in the `dish_preview` conversation state and types free text like "next", "continue", or "skip", THEN the system SHALL map the input to `Intent.NEXT_CATEGORY` so the user can advance to the next step without relying solely on button payloads

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user taps a real WhatsApp quick-reply "Next ➡️" button (template creation succeeds), THEN the system SHALL CONTINUE TO advance to the next dish preview step via the `next_category` button payload

3.2 WHEN the user types a number corresponding to a removable dish in the list, THEN the system SHALL CONTINUE TO resolve the input to the correct `remove_dish_xxx` ID and remove the dish

3.3 WHEN the user types comma-separated numbers (e.g., "1,3") to remove multiple dishes, THEN the system SHALL CONTINUE TO resolve the input to the correct multi-select `remove_dish_` IDs

3.4 WHEN the user is at the confirm step (step 6) and taps "✅ Confirm Dishes", THEN the system SHALL CONTINUE TO generate the weekly plan and transition to the main menu

3.5 WHEN the user is in any non-dish-preview conversation state (onboarding, main menu, etc.), THEN the system SHALL CONTINUE TO handle intents and free text as before without any changes to existing behavior

3.6 WHEN the quick-reply template creation succeeds (body within character limits), THEN the system SHALL CONTINUE TO send interactive quick-reply buttons as before without any changes to the message format
