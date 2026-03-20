# Meal Selection Stuck After Three — Bugfix Design

## Overview

Users cannot advance past step 3/5 (Gravy) in the dish preview flow. The root cause is a numbering collision: when the WhatsApp quick-reply template fails (body exceeds 1024 chars), the "Next ➡️" button falls back to "1. Next ➡️" in `TwilioMessagingProvider.sendButtonMessage`. However, the message body already contains a numbered list of removable dishes (e.g., "1. Paneer Butter Masala"). The `resolveNumberedInput` function in `webhookHandler.ts` stores list item IDs before button IDs in `lastButtonIds`, so typing "1" resolves to the first list item (`remove_dish_xxx`) instead of `next_category`. Additionally, the `intentMapper` has no free-text fallback for "next"/"continue"/"skip" in the `dish_preview` state, leaving users with no workaround.

The fix involves three changes: (1) make the fallback button numbering in `TwilioMessagingProvider` continue from the list item count instead of restarting at 1, (2) add free-text intent mapping for navigation words in `dish_preview` state, and (3) as a defense-in-depth measure, truncate the step message body to stay within the 1024-char quick-reply limit so the fallback path is hit less often.

## Glossary

- **Bug_Condition (C)**: The user is in `dish_preview` state at a step with list items (removable dishes), the quick-reply template creation fails, and the "Next ➡️" button falls back to numbered text starting at "1." — conflicting with the existing numbered dish list
- **Property (P)**: When the user types the number corresponding to "Next ➡️" or types free text like "next"/"continue"/"skip", the system resolves the input to `next_category` and advances to the next preview step
- **Preservation**: Mouse clicks, real quick-reply button taps, numbered dish removal, multi-select removal, confirm flow, and all non-dish-preview conversation states must remain unchanged
- **resolveNumberedInput**: Function in `webhookHandler.ts` that maps a typed number to a `lastButtonIds` entry when no real button payload is present
- **sendButtonMessage**: Method in `TwilioMessagingProvider` that attempts quick-reply template creation and falls back to numbered text buttons
- **lastButtonIds**: Array stored on `UserState` containing list item IDs followed by button IDs, used by `resolveNumberedInput` for numbered input resolution
- **mapWhatsAppToIntent**: Function in `intentMapper.ts` that converts WhatsApp payloads and free text into `UserIntent` objects

## Bug Details

### Bug Condition

The bug manifests when a user is in the `dish_preview` conversation state at a step that has removable dishes (list items), the quick-reply template creation fails (body > 1024 chars), and the "Next ➡️" button falls back to numbered text. The fallback numbering restarts at 1, conflicting with the dish list numbering. The `resolveNumberedInput` function resolves "1" to the first list item ID instead of `next_category` because `lastButtonIds` stores list items before buttons.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { conversationState, previewStep, body, buttonPayload, lastButtonIds }
  OUTPUT: boolean

  RETURN input.conversationState == 'dish_preview'
         AND input.previewStep IN ['breakfast', 'base', 'gravy', 'dry_veggie', 'side']
         AND input.buttonPayload IS undefined  -- quick-reply failed, user typed text
         AND lastButtonIds HAS list item IDs before button IDs
         AND (
           -- Case A: typed number that collides with list item index
           (parseInt(input.body) >= 1 AND parseInt(input.body) <= count(listItemIds))
           OR
           -- Case B: typed free text like "next" with no intent mapping
           (input.body IN ['next', 'continue', 'skip', 'next category'])
         )
END FUNCTION
```

### Examples

- User is at step 3/5 (Gravy) with 8 gravy items listed. Body exceeds 1024 chars. "Next ➡️" falls back to "1. Next ➡️". User types "1" → resolves to `remove_dish_gravy_001` instead of `next_category`. User is stuck.
- User is at step 4/5 (Dry Veggie) with 6 items. Fallback shows "1. Next ➡️". User types "1" → removes first dry veggie instead of advancing. User is stuck.
- User types "next" at any dish preview step → `intentMapper` returns `Intent.UNKNOWN` → bot re-presents the same step. User has no way to advance without tapping the real button.
- User is at step 1/5 (Breakfast) with 7 breakfasts. Body is short enough for quick-reply to succeed. User taps "Next ➡️" button → works correctly (not a bug condition).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Tapping a real WhatsApp quick-reply "Next ➡️" button (when template creation succeeds) must continue to advance to the next step via the `next_category` button payload
- Typing a number corresponding to a removable dish must continue to resolve to the correct `remove_dish_xxx` ID
- Typing comma-separated numbers (e.g., "1,3") for multi-select dish removal must continue to work
- Tapping "✅ Confirm Dishes" at the confirm step must continue to generate the weekly plan
- All non-dish-preview conversation states (onboarding, main menu, more options, etc.) must handle intents and free text exactly as before
- When quick-reply template creation succeeds (body within limits), interactive buttons must be sent as before

**Scope:**
All inputs where the bug condition does NOT hold should be completely unaffected. This includes:
- Real button payload interactions (quick-reply taps)
- Numbered input that correctly maps to a dish removal (no collision)
- All conversation states other than `dish_preview`
- Steps without list items (e.g., `confirm`)

## Hypothesized Root Cause

Based on the bug description and code analysis, the issues are:

1. **Fallback numbering restarts at 1**: In `TwilioMessagingProvider.sendButtonMessage`, the fallback path renders buttons as `${i + 1}. ${b.title}` starting from index 0. When the message body already contains a numbered list of dishes (rendered by `webhookHandler.ts` as `${i + 1}. ${it.item}`), the button numbering collides. The user sees two "1." entries — one for the first dish and one for "Next ➡️".

2. **`lastButtonIds` ordering creates index collision**: In `webhookHandler.ts`, `lastButtonIds` is built by pushing list item IDs first, then button IDs. So for a step with 8 list items and 1 button, `lastButtonIds[0..7]` are `remove_dish_*` and `lastButtonIds[8]` is `next_category`. The user would need to type "9" to hit `next_category`, but the fallback text shows "1. Next ➡️".

3. **No free-text fallback in intentMapper**: The `mapWhatsAppToIntent` function has no handling for free text in the `dish_preview` state. Words like "next", "continue", "skip" fall through to `Intent.UNKNOWN`, which causes the bot to re-present the current step.

4. **Long message bodies at later steps**: Steps 3-5 (gravy, dry_veggie, side) tend to have larger component pools spanning both lunch and dinner, producing longer message bodies that exceed the 1024-char WhatsApp interactive message limit more frequently.

## Correctness Properties

Property 1: Bug Condition — Fallback Button Numbering Continues From List Count

_For any_ dish preview step where list items are present and the button falls back to numbered text, the fallback button number SHALL be `listItemCount + buttonIndex + 1` (continuing the numbering sequence), so that typing that number resolves to the correct button ID via `lastButtonIds`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition — Free Text Navigation in Dish Preview

_For any_ input where the user is in `dish_preview` state and types free text matching navigation words ("next", "continue", "skip", "next category"), the `mapWhatsAppToIntent` function SHALL return `Intent.NEXT_CATEGORY`, allowing the user to advance without relying on button payloads.

**Validates: Requirements 2.4**

Property 3: Preservation — Non-Bug Inputs Unchanged

_For any_ input where the bug condition does NOT hold (real button payloads, valid dish removal numbers, non-dish-preview states, confirm step), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/adapters/twilioMessagingProvider.ts`

**Method**: `sendButtonMessage`

**Specific Changes**:
1. **Accept an optional `listItemCount` parameter**: Add a parameter to `sendButtonMessage` that indicates how many list items precede the buttons in the numbered sequence.
2. **Continue fallback numbering from list item count**: In the fallback path, change `${i + 1}. ${b.title}` to `${listItemCount + i + 1}. ${b.title}` so button numbers don't collide with list item numbers.

**File**: `src/core/ports.ts`

**Interface**: `MessagingProvider`

**Specific Changes**:
3. **Add `listItemCount` parameter to `sendButtonMessage` signature**: Update the interface to accept the optional parameter.

**File**: `src/handlers/webhookHandler.ts`

**Function**: `webhookHandler` (message sending section)

**Specific Changes**:
4. **Pass list item count to `sendButtonMessage`**: When calling `sendButtonMessage` with a body that includes numbered list items, pass the list item count so the fallback numbering continues correctly.

**File**: `src/intentMapper.ts`

**Function**: `mapWhatsAppToIntent`

**Specific Changes**:
5. **Add free-text handling for `dish_preview` state**: Before the final `Intent.UNKNOWN` return, add a block that checks if `conversationState === 'dish_preview'` and `text` matches navigation words ("next", "continue", "skip", "next category", "forward"), returning `Intent.NEXT_CATEGORY`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate the numbered fallback scenario — a dish preview step with list items where the button falls back to numbered text. Verify that `resolveNumberedInput` resolves "1" to a list item instead of `next_category`. Also test that `mapWhatsAppToIntent` returns `UNKNOWN` for "next" in `dish_preview` state.

**Test Cases**:
1. **Fallback Numbering Collision Test**: Create `lastButtonIds` with 6 list item IDs + 1 button ID. Call `resolveNumberedInput(undefined, "1", lastButtonIds)` — expect it returns the first list item, not `next_category` (will demonstrate the bug on unfixed code)
2. **Free Text "next" in dish_preview Test**: Call `mapWhatsAppToIntent(undefined, "next", "dish_preview")` — expect `Intent.UNKNOWN` on unfixed code (demonstrates the missing free-text handling)
3. **Free Text "skip" in dish_preview Test**: Call `mapWhatsAppToIntent(undefined, "skip", "dish_preview")` — expect `Intent.UNKNOWN` on unfixed code
4. **Fallback Button Text Format Test**: Verify that `sendButtonMessage` fallback renders "1. Next ➡️" instead of "7. Next ➡️" when there are 6 list items (demonstrates the numbering restart on unfixed code)

**Expected Counterexamples**:
- `resolveNumberedInput` returns `remove_dish_xxx` when user types "1" intending "Next ➡️"
- `mapWhatsAppToIntent` returns `Intent.UNKNOWN` for "next", "continue", "skip" in `dish_preview`
- Fallback button text starts numbering at 1 regardless of list item count

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  -- Fallback numbering fix
  result := sendButtonMessage_fixed(to, body, buttons, undefined, listItemCount)
  ASSERT fallbackText contains "${listItemCount + 1}. Next ➡️"

  -- resolveNumberedInput now resolves correctly
  resolved := resolveNumberedInput(undefined, String(listItemCount + 1), lastButtonIds)
  ASSERT resolved == 'next_category'

  -- Free text fallback
  intent := mapWhatsAppToIntent_fixed(undefined, "next", "dish_preview")
  ASSERT intent.intent == Intent.NEXT_CATEGORY
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT mapWhatsAppToIntent_original(input) == mapWhatsAppToIntent_fixed(input)
  ASSERT resolveNumberedInput_original(input) == resolveNumberedInput_fixed(input)
  ASSERT sendButtonMessage_original(input) == sendButtonMessage_fixed(input)  -- when listItemCount is 0
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across conversation states and input types
- It catches edge cases in intent mapping that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for all non-dish-preview states and for dish-preview with real button payloads, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Intent Mapping Preservation**: For all conversation states other than `dish_preview`, verify `mapWhatsAppToIntent` returns the same result before and after the fix
2. **Dish Preview Button Payload Preservation**: For `dish_preview` state with real button payloads (`next_category`, `confirm_dishes`, `remove_dish_*`), verify intent mapping is unchanged
3. **Numbered Input Resolution Preservation**: For `resolveNumberedInput` with valid dish removal numbers (not colliding with button indices), verify resolution is unchanged
4. **Fallback Numbering Without List Items**: When `listItemCount` is 0 (no list items), verify fallback numbering starts at 1 as before

### Unit Tests

- Test `sendButtonMessage` fallback numbering with various `listItemCount` values (0, 3, 8, 10)
- Test `mapWhatsAppToIntent` with "next", "continue", "skip", "next category" in `dish_preview` state
- Test `mapWhatsAppToIntent` with "next" in non-dish-preview states (should remain `UNKNOWN`)
- Test `resolveNumberedInput` with `lastButtonIds` containing list items + buttons, typing the correct button number

### Property-Based Tests

- Generate random conversation states and free text, verify intent mapping matches expected behavior
- Generate random `lastButtonIds` arrays with varying list item counts, verify `resolveNumberedInput` correctly resolves button numbers after the list item offset
- Generate random button arrays with random `listItemCount` values, verify fallback text numbering continues from the list item count

### Integration Tests

- Test full webhook flow: dish preview step with 8 list items, quick-reply fails, user types the correct offset number → advances to next step
- Test full webhook flow: user types "next" at gravy step → advances to dry_veggie step
- Test full webhook flow: user types "1" at a step with list items → removes the first dish (not advance)
