# Tasks — Meal Selection Stuck After Three

## Exploratory Bug Condition Checking

- [x] 1.1 Write exploratory test: `resolveNumberedInput` resolves "1" to first list item (not `next_category`) when `lastButtonIds` has list items before buttons
- [x] 1.2 Write exploratory test: `mapWhatsAppToIntent` returns `Intent.UNKNOWN` for "next" in `dish_preview` state
- [x] 1.3 Write exploratory test: `TwilioMessagingProvider.sendButtonMessage` fallback renders "1. Next ➡️" regardless of list item count
- [x] 1.4 Run exploratory tests on unfixed code to confirm root cause

## Fix Implementation

- [x] 2.1 Update `MessagingProvider` interface in `src/core/ports.ts`: add optional `listItemCount` parameter to `sendButtonMessage`
- [x] 2.2 Update `TwilioMessagingProvider.sendButtonMessage` in `src/adapters/twilioMessagingProvider.ts`: use `listItemCount + i + 1` for fallback button numbering
- [x] 2.3 Update `webhookHandler.ts`: pass `formatted.listItems?.length ?? 0` as `listItemCount` when calling `sendButtonMessage`
- [x] 2.4 Add free-text handling in `src/intentMapper.ts` for `dish_preview` state: map "next", "continue", "skip", "next category", "forward" to `Intent.NEXT_CATEGORY`

## Fix Checking

- [x] 3.1 Write fix-check test: `sendButtonMessage` fallback renders "7. Next ➡️" when `listItemCount` is 6
- [x] 3.2 Write fix-check test: `mapWhatsAppToIntent` returns `Intent.NEXT_CATEGORY` for "next", "continue", "skip" in `dish_preview`
- [x] 3.3 Write fix-check test: `resolveNumberedInput` resolves the correct offset number to `next_category` when list items precede buttons in `lastButtonIds`
- [x] 3.4 Write fix-check property test: for any `listItemCount` N and button array, fallback text numbers buttons starting at N+1
  - **Property**: Property 1 — Fallback Button Numbering Continues From List Count
- [x] 3.5 Write fix-check property test: for any navigation word in `dish_preview` state, `mapWhatsAppToIntent` returns `NEXT_CATEGORY`
  - **Property**: Property 2 — Free Text Navigation in Dish Preview

## Preservation Checking

- [x] 4.1 Write preservation test: `mapWhatsAppToIntent` returns same results for all non-dish-preview states after fix
- [x] 4.2 Write preservation test: `mapWhatsAppToIntent` returns same results for `dish_preview` with real button payloads (`next_category`, `confirm_dishes`, `remove_dish_*`)
- [x] 4.3 Write preservation test: `resolveNumberedInput` correctly resolves dish removal numbers that don't collide with button indices
- [x] 4.4 Write preservation test: `sendButtonMessage` fallback numbering starts at 1 when `listItemCount` is 0
- [x] 4.5 Write preservation property test: for any conversation state other than `dish_preview`, intent mapping is unchanged by the fix
  - **Property**: Property 3 — Non-Bug Inputs Unchanged
- [x] 4.6 Write preservation property test: for `dish_preview` with real button payloads, intent mapping is unchanged
  - **Property**: Property 3 — Non-Bug Inputs Unchanged

## Integration Tests

- [x] 5.1 Write integration test: full webhook flow — dish preview step with list items, user types correct offset number → advances to next step
- [x] 5.2 Write integration test: full webhook flow — user types "next" at gravy step → advances to dry_veggie
- [x] 5.3 Write integration test: full webhook flow — user types "1" at step with list items → removes first dish (not advance)
