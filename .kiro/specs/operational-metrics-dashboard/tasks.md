# Implementation Plan: Operational Metrics Dashboard

## Overview

Add inline metrics emission to all existing handlers using a MetricsPort abstraction, create a Metrics API Lambda + static web dashboard for operator access, and provision a CloudWatch Dashboard via the deploy script. All metrics are emitted at point of action — no batch jobs.

## Tasks

- [x] 1. Define MetricsPort interface and implement CloudWatchMetricsAdapter
  - [x] 1.1 Add MetricsPort interface and MetricDatum type to `src/core/ports.ts`
    - Add `MetricDatum` interface with `name`, `value`, `unit`, and optional `dimensions`
    - Add `MetricsPort` interface with `publishMetric` and `publishMetrics` methods
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Create `src/adapters/cloudwatchMetricsAdapter.ts`
    - Implement `MetricsPort` using `@aws-sdk/client-cloudwatch` `PutMetricData` API
    - Publish to `SmartMealPlanner` namespace
    - Batch calls in groups of 25 metric data points per PutMetricData call
    - Wrap errors so callers can decide whether to swallow or re-throw
    - _Requirements: 9.3_

  - [ ]* 1.3 Write property test for CloudWatch adapter batching
    - **Property 7: CloudWatch adapter batches metrics within PutMetricData limits**
    - Generate random arrays of MetricDatum (0 to 100+), pass to adapter with mocked CloudWatch client, verify ⌈n/25⌉ calls and all metrics appear exactly once
    - **Validates: Requirements 9.3**

  - [ ]* 1.4 Write unit tests for CloudWatchMetricsAdapter
    - Test empty metrics array produces zero API calls
    - Test exactly 25 metrics produces one call
    - Test 26 metrics produces two calls
    - Test namespace is `SmartMealPlanner`
    - _Requirements: 9.3_

- [x] 2. Create Daily Activity Table and DAU tracking logic
  - [x] 2.1 Add `ensureDailyActivityTable` function to `scripts/deploy.js`
    - Create DynamoDB table `MealPlannerDailyActivity-${stage}` with partition key `pk` (string)
    - Enable TTL on `ttl` attribute
    - Add IAM policy for `dynamodb:PutItem` on this table for the Lambda role
    - _Requirements: 2.3_

  - [x] 2.2 Create DAU tracking helper in `src/adapters/dailyActivityRepository.ts`
    - Implement conditional `PutItem` with `attribute_not_exists(pk)` where key is `phoneNumber#YYYY-MM-DD`
    - Set TTL to 31 days from creation
    - Return boolean indicating whether this was the first activity of the day
    - Add `DAILY_ACTIVITY_TABLE` to `src/config.ts` and `loadConfig()`
    - _Requirements: 2.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add metrics emission to webhookHandler
  - [x] 4.1 Instantiate CloudWatchMetricsAdapter and DailyActivityRepository in `src/handlers/webhookHandler.ts`
    - Create metrics adapter alongside existing adapters
    - Create daily activity repository for DAU tracking
    - Add latency timer (`Date.now()` at start)
    - _Requirements: 9.4_

  - [x] 4.2 Emit user acquisition metrics in webhookHandler
    - Emit `NewUser` (count 1) when `userStateRepo.getUser()` returns null (new user)
    - Emit `OnboardingComplete` (count 1) when response type is `ONBOARDING_COMPLETE`
    - Emit `OnboardingStep` with `Step` dimension when conversationState transitions to an onboarding step
    - Emit `ReachedPayment` (count 1) when conversationState transitions to `awaiting_payment`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 4.3 Emit engagement and feature usage metrics in webhookHandler
    - Emit `MessageReceived` (count 1) on every message
    - Emit `IntentProcessed` with `IntentName` dimension set to resolved intent
    - Emit `DailyActiveUser` (count 1) when daily activity conditional put succeeds
    - Emit `PlanGenerated` for GENERATE_PLAN intent
    - Emit `GroceryListViewed` for VIEW_WEEKLY_GROCERY or VIEW_TOMORROW_GROCERY intents
    - Emit `CookMenuSent` for SEND_MENU_TO_COOK intent
    - Emit `PlanModified` for CHANGE_FEW_MEALS or CHANGE_ENTIRE_PLAN intents
    - Emit `MealSwapped` for SWAP_LUNCH intent
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.4 Emit error and latency metrics in webhookHandler
    - Emit `WebhookError` (count 1) in the catch block
    - Emit `InvalidInput` (count 1) when response type is `INVALID_INPUT`
    - Emit `WebhookLatency` (milliseconds) at the end of processing
    - Wrap all metric emissions in try/catch so failures never break the user-facing response
    - _Requirements: 4.1, 4.6, 7.1_

  - [ ]* 4.5 Write property test for webhook MessageReceived and IntentProcessed emission
    - **Property 2: Webhook handler emits MessageReceived and IntentProcessed on every message**
    - Generate random valid webhook events, mock metrics port, verify both metrics always emitted
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 4.6 Write property test for webhook feature/error metric mapping
    - **Property 3: Webhook handler emits correct feature and error metrics based on intent and response type**
    - Generate random intents from the mapping set, verify correct feature metric emitted
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.6**

  - [ ]* 4.7 Write property test for webhook error metric emission
    - **Property 4: Webhook handler emits WebhookError on unhandled exceptions**
    - Generate webhook events that cause processing to throw, verify WebhookError emitted
    - **Validates: Requirements 4.1**

  - [ ]* 4.8 Write property test for webhook latency metric
    - **Property 6: Webhook latency metric is non-negative and always emitted**
    - Generate random webhook events, verify WebhookLatency emitted with non-negative value
    - **Validates: Requirements 7.1**

  - [ ]* 4.9 Write property test for NewUser metric emission
    - **Property 1: Webhook handler emits NewUser only for first-time users**
    - Generate webhook events for new and existing users, verify NewUser emitted only when no existing state
    - **Validates: Requirements 1.1**

- [x] 5. Add metrics emission to paymentWebhookHandler
  - [x] 5.1 Add metrics emission to `src/handlers/paymentWebhookHandler.ts`
    - Instantiate CloudWatchMetricsAdapter
    - Emit `SubscriptionActivated` (count 1) on `subscription.activated` event
    - Emit `PaymentCaptured` (count 1) on `payment.captured` event
    - Emit `PaymentWebhookError` (count 1) in the catch block
    - Emit `InvalidPaymentSignature` (count 1) on signature verification failure
    - Wrap metric emissions in try/catch
    - _Requirements: 4.2, 4.3, 5.1, 5.2_

  - [ ]* 5.2 Write unit tests for payment webhook metrics
    - Test `subscription.activated` emits `SubscriptionActivated`
    - Test `payment.captured` emits `PaymentCaptured`
    - Test invalid signature emits `InvalidPaymentSignature`
    - Test error emits `PaymentWebhookError`
    - _Requirements: 4.2, 4.3, 5.1, 5.2_

- [x] 6. Add metrics emission to reminder handlers
  - [x] 6.1 Add metrics emission to `src/handlers/dailyReminderHandler.ts`
    - Instantiate CloudWatchMetricsAdapter
    - Emit `DailyReminderSent` (count 1) per successful reminder
    - Emit `ExpiredPlanPromptSent` (count 1) per expired plan prompt
    - Emit `DailyReminderFailure` (count 1) in the per-user catch block
    - _Requirements: 4.4, 6.1, 6.3_

  - [x] 6.2 Add metrics emission to `src/handlers/weeklyReminderHandler.ts`
    - Instantiate CloudWatchMetricsAdapter
    - Emit `WeeklyReminderSent` (count 1) per successful reminder
    - Emit `WeeklyReminderFailure` (count 1) in the per-user catch block
    - _Requirements: 4.5, 6.2_

  - [ ]* 6.3 Write property test for reminder handler metrics
    - **Property 5: Reminder handlers emit correct success and failure metrics**
    - Generate random user states, mock messaging provider to succeed or fail, verify correct metrics
    - **Validates: Requirements 4.4, 4.5, 6.1, 6.2, 6.3**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create Metrics API Lambda
  - [x] 8.1 Create `src/handlers/metricsApiHandler.ts`
    - Handle GET requests with `range` query param (today, 7d, 30d)
    - Validate `x-api-key` header or `apiKey` query parameter against `METRICS_API_KEY` env var
    - Return 401 for missing/invalid API key
    - Return 400 for invalid `range` parameter
    - Query CloudWatch `GetMetricData` for all metric groups (user acquisition, engagement, feature usage, errors, payments, reminders, latency)
    - Return JSON response matching `MetricsApiResponse` shape from design
    - Add `METRICS_API_KEY` to config
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 8.2 Write property test for Metrics API authentication
    - **Property 8: Metrics API rejects unauthenticated requests**
    - Generate random strings as API keys (valid and invalid), verify 401 for invalid and 200 for valid
    - **Validates: Requirements 10.2**

  - [ ]* 8.3 Write unit tests for Metrics API
    - Test valid request with each date range returns correct time period
    - Test missing `range` defaults to `today`
    - Test missing API key returns 401
    - _Requirements: 10.1, 10.2_

- [x] 9. Create static Web Dashboard
  - [x] 9.1 Create `src/dashboard/index.html`
    - Static HTML page with vanilla JS (no build step)
    - Load Chart.js from CDN
    - API key prompt on first visit, stored in `localStorage`
    - Date range selector: today, last 7 days, last 30 days
    - Auto-refresh every 5 minutes
    - Render charts for all 7 metric groups: user acquisition, engagement, feature usage, errors, payments, reminders, latency
    - Include p50/p90/p99 latency chart
    - _Requirements: 10.4, 10.5, 10.6, 10.7_

- [x] 10. Update deploy script with new infrastructure
  - [x] 10.1 Add Daily Activity Table provisioning to `scripts/deploy.js`
    - Create `MealPlannerDailyActivity-${stage}` table
    - Enable TTL on `ttl` attribute
    - _Requirements: 2.3_

  - [x] 10.2 Add IAM permissions for CloudWatch and Daily Activity Table
    - Add `cloudwatch:PutMetricData` permission for all handler Lambdas
    - Add `cloudwatch:GetMetricData` permission for Metrics API Lambda
    - Add `dynamodb:PutItem` on Daily Activity Table for webhook Lambda
    - _Requirements: 9.3, 9.4_

  - [x] 10.3 Add Metrics API Lambda deployment to `scripts/deploy.js`
    - Add `MealPlannerMetricsApi-${stage}` Lambda definition
    - Create `/metrics` API Gateway resource with GET method
    - Pass `METRICS_API_KEY` env var to the Lambda
    - Add CORS headers for web dashboard access
    - _Requirements: 10.1, 10.9_

  - [x] 10.4 Add S3 dashboard bucket and upload to `scripts/deploy.js`
    - Create `smartmealplanner-dashboard-${stage}` S3 bucket with public read
    - Upload `src/dashboard/index.html` to the bucket
    - Output the dashboard URL
    - _Requirements: 10.8_

  - [x] 10.5 Add CloudWatch Dashboard provisioning to `scripts/deploy.js`
    - Use `CloudWatchClient.putDashboard()` to create `SmartMealPlanner-${stage}` dashboard
    - Add 7 widgets: user acquisition, engagement, feature usage, errors, payments, reminders, latency (p50/p90/p99)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 10.6 Update esbuild config in `package.json` to bundle metricsApiHandler
    - Add metricsApiHandler to the build entry points
    - _Requirements: 10.9_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All metric emissions are wrapped in try/catch so failures never break user-facing functionality
- The `@aws-sdk/client-cloudwatch` package needs to be added as a dependency
