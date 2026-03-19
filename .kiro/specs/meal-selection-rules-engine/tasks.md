# Implementation Plan: Meal Selection Rules Engine

## Overview

Externalize meal selection constraints from hardcoded TypeScript into a declarative JSON rules file with a lightweight rules engine. Implementation proceeds bottom-up: types → rules engine (load/validate/serialize) → meal selector (filter/constrain pipeline) → integration with existing planGenerator and dishPreview → default rules file encoding all current behavior.

## Tasks

- [x] 1. Define Rule types and add RulesRepository port
  - [x] 1.1 Add Rule type definitions to `src/core/types.ts`
    - Add `RuleAction`, `RuleScope`, `Rule`, `RuleConditions`, `RuleEvaluationContext` interfaces/types as specified in the design
    - Export all new types alongside existing types
    - _Requirements: 1.1, 1.4, 1.5, 1.6_
  - [x] 1.2 Add `RulesRepository` port to `src/core/ports.ts`
    - Add `RulesRepository` interface with `getRules(): Promise<Rule[]>` method
    - _Requirements: 13.1_

- [x] 2. Implement RulesEngine core (load, validate, serialize)
  - [x] 2.1 Create `src/core/rulesEngine.ts` with validation and serialization
    - Implement `validateRules(rules: Rule[])`: checks required fields (`id`, `name`, `description`, `action`), rejects duplicates, validates action types and scope values
    - Implement `parseRules(json: string): Rule[]`: parses JSON string into typed Rule array, throws with file path on invalid JSON
    - Implement `serializeRules(rules: Rule[]): string`: serializes Rule array back to formatted JSON
    - Implement `getApplicableRules(rules: Rule[], scope: RuleScope, context: RuleEvaluationContext): Rule[]`: filters rules by scope and context
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.1, 11.2, 11.3_
  - [x]* 2.2 Write property test: Rules file round-trip (Property 1)
    - **Property 1: Rules file round-trip**
    - For any valid array of Rule objects, `parseRules(serializeRules(rules))` produces an equivalent array
    - **Validates: Requirements 11.1, 11.2, 11.3**
  - [x]* 2.3 Write property test: Validation rejects missing/empty required fields (Property 2)
    - **Property 2: Validation rejects missing or empty required fields**
    - For any Rule with a missing or empty required field, validation rejects and reports the specific field
    - **Validates: Requirements 2.2**
  - [x]* 2.4 Write property test: Validation rejects duplicate IDs (Property 3)
    - **Property 3: Validation rejects duplicate IDs**
    - For any array of Rules with duplicate IDs, validation rejects and reports the duplicate
    - **Validates: Requirements 2.3**
  - [x]* 2.5 Write property test: Invalid JSON produces parse error (Property 4)
    - **Property 4: Invalid JSON produces parse error**
    - For any non-JSON string, parsing produces an error including the file path
    - **Validates: Requirements 2.4**
  - [x]* 2.6 Write unit tests for `rulesEngine.ts`
    - Test specific validation error messages, edge cases (empty rules array, single rule), unknown action/scope values
    - Test `getApplicableRules` returns correct subset for each scope
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Implement JsonRulesRepository adapter
  - [x] 3.1 Create `src/adapters/jsonRulesRepository.ts`
    - Implement `JsonRulesRepository` class implementing `RulesRepository` port
    - Read and parse `data/meal-selection-rules.json`, cache result after first load
    - Throw descriptive errors for missing file (with path), invalid JSON (with path), and validation failures
    - _Requirements: 2.1, 2.4, 2.6, 13.1, 13.3_
  - [x]* 3.2 Write unit tests for `jsonRulesRepository.ts`
    - Test successful load, missing file error, invalid JSON error, validation error propagation
    - _Requirements: 2.1, 2.4, 2.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement MealSelector with filter rules
  - [x] 5.1 Create `src/core/mealSelector.ts` with filter pipeline
    - Implement `MealSelector` class accepting `RulesRepository`, `MealRepository`, `MealComponentRepository` via dependency injection
    - Implement `applyFilterRules`: applies cuisine, diet, style, and slot filter rules in sequence (intersection semantics)
    - Implement excluded dishes filter: removes items whose IDs are in the exclusion list
    - Implement diet fallback: when diet is `non_veg`, include both veg and non_veg items
    - Implement style fallback: when style is `health` and category has fewer items than threshold, add regular items with `(Regular)` suffix
    - Implement South Indian crossover filter: when cuisine is `both`, include all north_indian items but only whitelisted south_indian items
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 10.1, 10.2, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 13.2_
  - [x]* 5.2 Write property test: Filter rules produce only matching items (Property 5)
    - **Property 5: Filter rules produce only matching items**
    - For any pool and filter rule, every item in the result matches the user's preference; "both" passes all through
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  - [x]* 5.3 Write property test: Multiple filters compose as intersection (Property 6)
    - **Property 6: Multiple filters compose as intersection**
    - Applying filters in sequence equals intersecting individual filter results
    - **Validates: Requirements 3.5**
  - [x]* 5.4 Write property test: Diet fallback behavior (Property 7)
    - **Property 7: Diet fallback behavior**
    - non_veg preference with fallback includes both veg and non_veg; veg preference includes only veg
    - **Validates: Requirements 4.1, 4.2**
  - [x]* 5.5 Write property test: Style fallback adds labeled regular items (Property 8)
    - **Property 8: Style fallback adds labeled regular items below threshold**
    - When health items < threshold, regular items are added with "(Regular)" suffix
    - **Validates: Requirements 5.1, 5.2**
  - [x]* 5.6 Write property test: Regular style users don't get style fallback (Property 9)
    - **Property 9: Regular style users don't get style fallback**
    - When style is "regular", no items have the fallback label suffix
    - **Validates: Requirements 5.4**
  - [x]* 5.7 Write property test: Excluded dishes removed from all pools (Property 15)
    - **Property 15: Excluded dishes are removed from all pools**
    - No item in the result has an ID in the exclusion list; all non-excluded items are retained
    - **Validates: Requirements 10.1, 10.2**
  - [x]* 5.8 Write property test: South Indian crossover filter (Property 16)
    - **Property 16: South Indian crossover filter**
    - "both" cuisine: all north_indian included, only whitelisted south_indian included; single cuisine: no whitelist filtering
    - **Validates: Requirements 14.1, 14.2, 14.4, 14.5**

- [x] 6. Implement MealSelector constraint rules
  - [x] 6.1 Add constraint evaluation to `MealSelector`
    - Implement sliding window (`limit` action): track recent item IDs per slot/category over configurable window size, deprioritize recent items
    - Implement same-day deduplication (`constrain` with `same_day_dedup`): exclude lunch component IDs from dinner pool for same day
    - Implement ingredient overlap avoidance (`constrain` with `ingredient_overlap`): check key ingredient overlap between adjacent components (base→gravy, gravy→dry_veggie)
    - Implement cuisine alternation (`constrain` with `cuisine_alternation`): assign alternating cuisines to consecutive days when preference is "both"
    - Implement progressive relaxation for all constraints: when strict pass yields zero candidates, relax constraints in order
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_
  - [x]* 6.2 Write property test: Sliding window deprioritizes recent items (Property 10)
    - **Property 10: Sliding window deprioritizes recent items**
    - Items in the window are selected only when no non-window items are available
    - **Validates: Requirements 6.1, 6.2**
  - [x]* 6.3 Write property test: Progressive relaxation ensures selection always succeeds (Property 11)
    - **Property 11: Progressive relaxation ensures selection always succeeds**
    - For any non-empty pool with any active constraint, selection always returns a valid item
    - **Validates: Requirements 6.4, 7.2, 8.4**
  - [x]* 6.4 Write property test: Same-day dedup excludes lunch from dinner (Property 12)
    - **Property 12: Same-day dedup excludes lunch selections from dinner**
    - Lunch component IDs do not appear in strict-pass dinner candidates for the same day/category
    - **Validates: Requirements 7.1**
  - [x]* 6.5 Write property test: Adjacent components avoid key ingredient overlap (Property 13)
    - **Property 13: Adjacent components avoid key ingredient overlap**
    - Gravy doesn't share key ingredients with base; dry_veggie doesn't share with gravy (unless relaxed)
    - **Validates: Requirements 8.1, 8.2**
  - [x]* 6.6 Write property test: Cuisine assignment matches preference pattern (Property 14)
    - **Property 14: Cuisine assignment matches preference pattern**
    - "both" preference: consecutive days alternate cuisines; single preference: all days same cuisine
    - **Validates: Requirements 9.1, 9.2**

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create default rules file and integrate with existing modules
  - [x] 8.1 Create `data/meal-selection-rules.json` with default rules
    - Encode all current hardcoded constraints from `planGenerator.ts` and `dishPreview.ts` as declarative rules
    - Include all 11 rules from the design: cuisine-filter, diet-filter, diet-fallback, style-filter, style-fallback, excluded-dishes, south-indian-crossover, sliding-window, same-day-dedup, ingredient-overlap, cuisine-alternation
    - Ensure each rule has human-readable `description` field understandable by non-coders
    - Include South Indian crossover whitelist with Idli, Dosa, Rava Dosa, Masala Dosa, Uttapam, Sambhar and variants
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.3, 5.3, 6.3, 7.3, 8.3, 9.3, 10.3, 12.3, 14.3, 14.6, 14.7_
  - [x] 8.2 Update `planGenerator.ts` to delegate to `MealSelector`
    - Modify `generateWeeklyPlan` to accept optional `MealSelector` parameter
    - When `MealSelector` is provided, use rule-based filtering and constraint evaluation instead of inline logic
    - Preserve existing function signatures for backward compatibility (MealSelector is optional)
    - _Requirements: 12.1, 12.2_
  - [x] 8.3 Update `dishPreview.ts` to delegate to `MealSelector`
    - Modify `generateCandidateDishes` to accept optional `MealSelector` parameter
    - When `MealSelector` is provided, use rule-based candidate pool generation instead of inline `fetchCategoryPool`
    - Preserve existing function signatures for backward compatibility
    - _Requirements: 12.1, 12.2_

- [ ] 9. Backward compatibility verification
  - [x]* 9.1 Write property test: Backward compatibility with default rules (Property 17)
    - **Property 17: Backward compatibility with default rules**
    - For any user preferences and exclusion list, rules-based MealSelector with default rules produces equivalent candidate pools to current hardcoded `generateCandidateDishes`
    - **Validates: Requirements 12.1, 12.2**
  - [ ]* 9.2 Write unit tests for integration
    - Test MealSelector with JsonRulesRepository and real data files produces valid plans
    - Test default rules file loads and validates successfully
    - Test South Indian crossover whitelist contains required entries
    - _Requirements: 12.1, 12.2, 12.3, 14.3_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–17)
- Unit tests validate specific examples, edge cases, and integration points
- The implementation preserves backward compatibility by making `MealSelector` an optional parameter in existing functions
- All test files use `fast-check` for property-based tests and `vitest` as the test runner
