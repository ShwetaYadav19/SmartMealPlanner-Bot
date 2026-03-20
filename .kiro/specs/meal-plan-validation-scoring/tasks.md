# Implementation Plan: Meal Plan Validation & Scoring

## Overview

Incrementally build the validation and scoring layer: types first, then individual quality checks with property tests, scoring engine, retry orchestrator, DynamoDB adapter, and finally wire everything together. Each step builds on the previous and is independently testable.

## Tasks

- [ ] 1. Define types and interfaces
  - [ ] 1.1 Add validation types to `src/core/types.ts`
    - Add `CheckResult`, `Violation`, `ValidationResult`, `WeightConfig`, `RetryConfig`, `RetryOutcome`, `AttemptLog`, `PrecomputedPlanEntry`, `PreferenceKey`, `QualityCheckOptions`, and `QualityCheckFn` type
    - Export `DEFAULT_WEIGHT_CONFIG` with weights: proteinRepetition=3, sameDayDiversity=2, weeklyDishFrequency=2, mealBalance=2, minimumUniqueDishes=1, cuisineBalance=1, ingredientClash=1
    - _Requirements: 1.4, 2.5, 3.4, 4.4, 5.5, 6.5, 7.5, 8.3_

  - [ ] 1.2 Add `PrecomputedPlanRepository` port to `src/core/ports.ts`
    - Add `PrecomputedPlanRepository` interface with `getPrecomputedPlan(key: PreferenceKey)` and `storeIfBetter(key: PreferenceKey, plan: WeeklyPlan, result: ValidationResult)` methods
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 2. Implement quality check functions in `src/core/planValidator.ts`
  - [ ] 2.1 Implement `proteinRepetitionCheck`
    - Pure function `(plan: WeeklyPlan, options?: QualityCheckOptions) => CheckResult`
    - Scan gravy and dry_veggie components across consecutive days for protein keyIngredients (chicken, egg, fish, paneer)
    - Score = non-repeating transitions / 6
    - Include violation descriptions identifying which protein repeats on which day transitions
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.2 Write property test for proteinRepetitionCheck
    - **Property 1: Protein repetition score formula**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 2.3 Implement `sameDayDiversityCheck`
    - Compare lunch vs dinner gravy and dry_veggie component IDs per day
    - Score = days without violations / 7
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.4 Write property test for sameDayDiversityCheck
    - **Property 2: Same-day diversity score formula**
    - **Validates: Requirements 2.3, 2.4**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 2.5 Implement `weeklyDishFrequencyCheck`
    - Count each MealComponent ID across all 14 lunch/dinner slots
    - Flag components appearing >2 times
    - Score = non-violating unique components / total unique components
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 2.6 Write property test for weeklyDishFrequencyCheck
    - **Property 3: Weekly dish frequency score formula**
    - **Validates: Requirements 3.2, 3.3**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 2.7 Implement `mealBalanceCheck`
    - Verify each ComposedMeal has exactly one component per category (base, gravy, dry_veggie, side)
    - Score = balanced meals / 14
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 2.8 Write property test for mealBalanceCheck
    - **Property 4: Meal balance score formula**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 2.9 Implement `minimumUniqueDishesCheck`
    - Count distinct MealComponent IDs across lunch/dinner slots
    - Score = min(1.0, distinctCount / threshold), default threshold 12
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 2.10 Write property test for minimumUniqueDishesCheck
    - **Property 5: Minimum unique dishes score formula**
    - **Validates: Requirements 5.3, 5.4**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 2.11 Implement `cuisineBalanceCheck`
    - When cuisine preference is "both": count north_indian vs south_indian majority per composed meal
    - Score = 1.0 if ratio in [0.4, 0.6], linear decrease toward 0.0 outside that range
    - Return 1.0 when cuisine preference is single value
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 2.12 Write property tests for cuisineBalanceCheck
    - **Property 6: Cuisine balance score formula**
    - **Property 7: Cuisine balance bypass for single cuisine**
    - **Validates: Requirements 6.2, 6.3, 6.4**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 2.13 Implement `ingredientClashCheck`
    - Extract signature ingredients (protein, lentils, vegetables) from each component in a ComposedMeal
    - Detect shared ingredient names and cross-group protein conflicts
    - Score = clash-free meals / 14
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 2.14 Write property test for ingredientClashCheck
    - **Property 8: Ingredient clash score formula**
    - **Validates: Requirements 7.2, 7.3, 7.4**
    - File: `tst/core/planValidator.property.test.ts`

- [ ] 3. Implement scoring engine and validatePlan in `src/core/planValidator.ts`
  - [ ] 3.1 Implement `aggregateScore` function
    - Compute `Σ(score_i × weight_i) / Σ(weight_i)`, return value in [0.0, 1.0]
    - Guard against division by zero (all-zero weights → return 0.0)
    - _Requirements: 8.1, 8.2_

  - [ ]* 3.2 Write property test for aggregateScore
    - **Property 9: Weighted score aggregation and normalization**
    - **Validates: Requirements 8.1, 8.2, 8.4**
    - File: `tst/core/planValidator.property.test.ts`

  - [ ] 3.3 Implement `validatePlan` function
    - Run all 7 quality checks, aggregate scores, return `ValidationResult` with per-check breakdowns
    - Include violation details for any check with score < 1.0
    - _Requirements: 8.4, 11.1, 11.2_

  - [ ]* 3.4 Write property test for ValidationResult completeness
    - **Property 14: ValidationResult completeness**
    - **Validates: Requirements 11.1, 11.2**
    - File: `tst/core/planValidator.logging.property.test.ts`

  - [ ]* 3.5 Write unit tests for planValidator
    - Hand-crafted plans testing specific scenarios: consecutive protein days, all-same gravy, component appearing 4 times, missing category, single-cuisine bypass
    - Verify default weight config values
    - File: `tst/core/planValidator.test.ts`
    - _Requirements: 1.1–1.4, 2.1–2.5, 3.1–3.4, 4.1–4.4, 5.1–5.5, 6.1–6.5, 7.1–7.5, 8.1–8.4, 11.1, 11.2_

- [ ] 4. Checkpoint - Ensure all quality check tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement retry orchestrator in `src/core/retryOrchestrator.ts`
  - [ ] 5.1 Implement `generateValidatedPlan` function
    - Accept `generateFn: () => WeeklyPlan`, preferences, and `RetryConfig`
    - Loop up to `maxAttempts`, call `validatePlan` each iteration
    - Track best-scoring plan across attempts
    - Return early on first plan meeting `scoreThreshold`
    - Log each attempt's result (attempt number, score, accepted/rejected)
    - Return `RetryOutcome` with `accepted` flag and `attempts` array
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 11.3, 11.4_

  - [ ]* 5.2 Write property test for retry early exit
    - **Property 10: Retry early exit on passing score**
    - **Validates: Requirements 9.1, 9.2**
    - File: `tst/core/retryOrchestrator.property.test.ts`

  - [ ]* 5.3 Write property test for retry best-plan fallback
    - **Property 11: Retry returns best-scoring plan**
    - **Validates: Requirements 9.3, 9.4**
    - File: `tst/core/retryOrchestrator.property.test.ts`

  - [ ]* 5.4 Write property test for RetryOutcome logging completeness
    - **Property 15: RetryOutcome logging completeness**
    - **Validates: Requirements 11.3, 11.4**
    - File: `tst/core/planValidator.logging.property.test.ts`

  - [ ]* 5.5 Write unit tests for retryOrchestrator
    - Test maxAttempts=1 makes exactly 1 call, generateFn throwing is handled, all-fail returns best plan
    - File: `tst/core/retryOrchestrator.test.ts`
    - _Requirements: 9.1–9.5, 11.3, 11.4_

- [ ] 6. Checkpoint - Ensure retry orchestrator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement DynamoDB adapter for precomputed plans
  - [ ] 7.1 Implement `DynamoDBPrecomputedPlanRepository` in `src/adapters/dynamodbPrecomputedPlanRepository.ts`
    - Implement `PrecomputedPlanRepository` interface
    - Partition key: `{cuisine}#{diet}#{style}` composite string
    - `getPrecomputedPlan`: read entry by composite key
    - `storeIfBetter`: conditional put with `attribute_not_exists(pk) OR score < :newScore`
    - Handle `ConditionalCheckFailedException` by returning `false`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 7.2 Write property test for store-if-better monotonicity
    - **Property 12: Store-if-better monotonicity**
    - **Validates: Requirements 10.3, 10.4, 10.5**
    - File: `tst/adapters/precomputedPlanStore.property.test.ts`

  - [ ]* 7.3 Write property test for preference key uniqueness
    - **Property 13: Preference key uniqueness**
    - **Validates: Requirements 10.1**
    - File: `tst/adapters/precomputedPlanStore.property.test.ts`

  - [ ]* 7.4 Write unit tests for DynamoDB adapter
    - Test conditional put with lower score returns false, first-time store succeeds, ConditionalCheckFailedException handling
    - File: `tst/adapters/dynamodbPrecomputedPlanRepository.test.ts`
    - _Requirements: 10.1–10.6_

- [ ] 8. Implement serialization round-trip property tests
  - [ ]* 8.1 Write property test for WeeklyPlan serialization round-trip
    - **Property 16: WeeklyPlan serialization round-trip**
    - **Validates: Requirements 12.1**
    - File: `tst/core/validationRoundTrip.property.test.ts`

  - [ ]* 8.2 Write property test for ValidationResult serialization round-trip
    - **Property 17: ValidationResult serialization round-trip**
    - **Validates: Requirements 12.2**
    - File: `tst/core/validationRoundTrip.property.test.ts`

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code is TypeScript, tested with vitest + fast-check
