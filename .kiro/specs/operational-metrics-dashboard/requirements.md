# Requirements Document

## Introduction

An operational metrics dashboard for the Smart Meal Planner WhatsApp bot that emits real-time business, engagement, and system health metrics inline with every user action. The system provides two dashboard surfaces: a CloudWatch Dashboard for deep-dive analysis within AWS, and a publicly accessible web dashboard (static HTML hosted on S3) for quick daily checks without requiring AWS Console access. All metrics are emitted as CloudWatch Custom Metrics at the point of action — no DynamoDB scans or batch collection jobs required.

## Glossary

- **Dashboard**: A CloudWatch Dashboard that renders metric widgets for the Smart Meal Planner Bot
- **Web_Dashboard**: A static HTML page hosted on S3 that displays metric charts, accessible via a public URL without AWS Console login
- **Metrics_API**: A Lambda function behind API Gateway that returns the latest metrics as JSON for the Web_Dashboard to consume
- **Webhook_Handler**: The existing Lambda that processes incoming WhatsApp messages (webhookHandler)
- **Payment_Webhook_Handler**: The existing Lambda that processes Razorpay payment callbacks (paymentWebhookHandler)
- **Daily_Reminder_Handler**: The existing Lambda triggered by EventBridge to send daily meal reminders (dailyReminderHandler)
- **Weekly_Reminder_Handler**: The existing Lambda triggered by EventBridge to send weekly reminders (weeklyReminderHandler)
- **User_State_Repository**: The DynamoDB-backed repository that stores user state
- **Operator**: The person who monitors the bot's health and business performance daily
- **Metric_Namespace**: The CloudWatch custom namespace "SmartMealPlanner" under which all custom metrics are published
- **Active_User**: A user who sent at least one WhatsApp message to the bot within the measurement period
- **Onboarded_User**: A user whose `onboardingComplete` field is `true` in DynamoDB
- **Daily_Activity_Table**: A lightweight DynamoDB table with partition key `phoneNumber#YYYY-MM-DD` used to track first-activity-of-the-day per user for accurate DAU counting

## Requirements

### Requirement 1: Publish User Acquisition Metrics

**User Story:** As an operator, I want to see how many new users start using the bot each day, so that I can track growth and acquisition trends.

#### Acceptance Criteria

1. WHEN the Webhook_Handler processes a message from a phone number that has no existing user state in User_State_Repository, THE Webhook_Handler SHALL emit a "NewUser" metric with value 1 to the Metric_Namespace
2. WHEN the Webhook_Handler completes user onboarding (response type is ONBOARDING_COMPLETE), THE Webhook_Handler SHALL emit an "OnboardingComplete" metric with value 1 to the Metric_Namespace
3. WHEN the Webhook_Handler transitions a user's conversationState to any onboarding step, THE Webhook_Handler SHALL emit an "OnboardingStep" metric with value 1 and a "Step" dimension set to the new conversationState, so the operator can track funnel progression
4. WHEN the Webhook_Handler transitions a user's conversationState to `awaiting_payment`, THE Webhook_Handler SHALL emit a "ReachedPayment" metric with value 1 to the Metric_Namespace, representing users who completed onboarding preferences but have not yet paid

### Requirement 2: Publish Engagement Metrics

**User Story:** As an operator, I want to see daily user engagement levels, so that I can understand how actively users interact with the bot.

#### Acceptance Criteria

1. WHEN the Webhook_Handler processes a message, THE Webhook_Handler SHALL emit a "MessageReceived" metric with value 1 to the Metric_Namespace
2. WHEN the Webhook_Handler processes a message, THE Webhook_Handler SHALL emit an "IntentProcessed" metric with an "IntentName" dimension set to the resolved intent name
3. WHEN the Webhook_Handler processes a message from a user who has not yet been active today, THE Webhook_Handler SHALL emit a "DailyActiveUser" metric with value 1 to the Metric_Namespace; the handler SHALL use a lightweight DynamoDB conditional put (key: `phoneNumber#date`) to a Daily_Activity_Table to determine first-activity-of-the-day, emitting the metric only on the first message per user per day
4. THE Dashboard SHALL derive "Total Users So Far" using a CloudWatch cumulative SUM of the "NewUser" metric over all time
5. THE Dashboard SHALL derive "Daily Active Users" using the CloudWatch SUM of the "DailyActiveUser" metric for the selected day

### Requirement 3: Publish Feature Usage Metrics

**User Story:** As an operator, I want to know which features users engage with most, so that I can prioritize improvements.

#### Acceptance Criteria

1. WHEN the Webhook_Handler resolves an intent of type GENERATE_PLAN, THE Webhook_Handler SHALL emit a "PlanGenerated" metric with value 1 to the Metric_Namespace
2. WHEN the Webhook_Handler resolves an intent of type VIEW_WEEKLY_GROCERY or VIEW_TOMORROW_GROCERY, THE Webhook_Handler SHALL emit a "GroceryListViewed" metric with value 1 to the Metric_Namespace
3. WHEN the Webhook_Handler resolves an intent of type SEND_MENU_TO_COOK, THE Webhook_Handler SHALL emit a "CookMenuSent" metric with value 1 to the Metric_Namespace
4. WHEN the Webhook_Handler resolves an intent of type CHANGE_FEW_MEALS or CHANGE_ENTIRE_PLAN, THE Webhook_Handler SHALL emit a "PlanModified" metric with value 1 to the Metric_Namespace
5. WHEN the Webhook_Handler resolves an intent of type SWAP_LUNCH, THE Webhook_Handler SHALL emit a "MealSwapped" metric with value 1 to the Metric_Namespace

### Requirement 4: Publish Error and Failure Metrics

**User Story:** As an operator, I want to see how many requests fail each day, so that I can detect issues early and maintain system reliability.

#### Acceptance Criteria

1. WHEN the Webhook_Handler catches an unhandled error, THE Webhook_Handler SHALL emit a "WebhookError" metric with value 1 to the Metric_Namespace
2. WHEN the Payment_Webhook_Handler catches an unhandled error, THE Payment_Webhook_Handler SHALL emit a "PaymentWebhookError" metric with value 1 to the Metric_Namespace
3. WHEN the Payment_Webhook_Handler receives a request with an invalid Razorpay signature, THE Payment_Webhook_Handler SHALL emit a "InvalidPaymentSignature" metric with value 1 to the Metric_Namespace
4. WHEN the Daily_Reminder_Handler fails to send a reminder to a user, THE Daily_Reminder_Handler SHALL emit a "DailyReminderFailure" metric with value 1 to the Metric_Namespace
5. WHEN the Weekly_Reminder_Handler fails to send a reminder to a user, THE Weekly_Reminder_Handler SHALL emit a "WeeklyReminderFailure" metric with value 1 to the Metric_Namespace
6. WHEN the Webhook_Handler produces a response of type INVALID_INPUT, THE Webhook_Handler SHALL emit an "InvalidInput" metric with value 1 to the Metric_Namespace

### Requirement 5: Publish Payment and Subscription Metrics

**User Story:** As an operator, I want to track payment conversions and subscription health, so that I can monitor revenue and identify payment issues.

#### Acceptance Criteria

1. WHEN the Payment_Webhook_Handler processes a `subscription.activated` event, THE Payment_Webhook_Handler SHALL emit a "SubscriptionActivated" metric with value 1 to the Metric_Namespace
2. WHEN the Payment_Webhook_Handler processes a `payment.captured` event, THE Payment_Webhook_Handler SHALL emit a "PaymentCaptured" metric with value 1 to the Metric_Namespace
3. THE Dashboard SHALL use CloudWatch metric math to derive active subscription counts from cumulative SubscriptionActivated events minus SubscriptionExpired/SubscriptionCancelled events

### Requirement 6: Publish Reminder Delivery Metrics

**User Story:** As an operator, I want to track how many reminders are sent successfully each day, so that I can ensure users receive their meal plans on time.

#### Acceptance Criteria

1. WHEN the Daily_Reminder_Handler sends a reminder to a user, THE Daily_Reminder_Handler SHALL emit a "DailyReminderSent" metric with value 1 to the Metric_Namespace
2. WHEN the Weekly_Reminder_Handler sends a reminder to a user, THE Weekly_Reminder_Handler SHALL emit a "WeeklyReminderSent" metric with value 1 to the Metric_Namespace
3. WHEN the Daily_Reminder_Handler sends an expired plan prompt instead of a meal reminder, THE Daily_Reminder_Handler SHALL emit a "ExpiredPlanPromptSent" metric with value 1 to the Metric_Namespace

### Requirement 7: Publish Webhook Latency Metrics

**User Story:** As an operator, I want to monitor response times, so that I can ensure the bot responds to users within acceptable time limits.

#### Acceptance Criteria

1. WHEN the Webhook_Handler finishes processing a message, THE Webhook_Handler SHALL emit a "WebhookLatency" metric with the elapsed processing time in milliseconds to the Metric_Namespace
2. THE Dashboard SHALL display the p50, p90, and p99 latency percentiles for the WebhookLatency metric over the selected time range

### Requirement 8: Create CloudWatch Dashboard

**User Story:** As an operator, I want a single dashboard view of all metrics, so that I can assess system health and business performance at a glance.

#### Acceptance Criteria

1. THE Dashboard SHALL include a widget displaying NewUser, OnboardingComplete, OnboardingStep (by Step dimension), and ReachedPayment as a time-series graph
2. THE Dashboard SHALL include a widget displaying MessageReceived counts as a time-series graph
3. THE Dashboard SHALL include a widget displaying PlanGenerated, GroceryListViewed, CookMenuSent, PlanModified, and MealSwapped as a time-series graph
4. THE Dashboard SHALL include a widget displaying WebhookError, PaymentWebhookError, DailyReminderFailure, WeeklyReminderFailure, InvalidPaymentSignature, and InvalidInput as a time-series graph
5. THE Dashboard SHALL include a widget displaying SubscriptionActivated and PaymentCaptured as a time-series graph
6. THE Dashboard SHALL include a widget displaying DailyReminderSent, WeeklyReminderSent, and ExpiredPlanPromptSent as a time-series graph
7. THE Dashboard SHALL include a widget displaying WebhookLatency p50, p90, and p99 percentiles as a time-series graph
8. THE Dashboard SHALL be provisioned via the deploy script alongside existing infrastructure

### Requirement 9: Metrics Port Abstraction

**User Story:** As a developer, I want metrics emission to be abstracted behind a port interface, so that the core logic remains decoupled from CloudWatch and metrics can be tested without AWS dependencies.

#### Acceptance Criteria

1. THE Metrics_Port SHALL define a `publishMetric` method that accepts a metric name, value, unit, and optional dimensions
2. THE Metrics_Port SHALL define a `publishMetrics` method that accepts a batch of metrics for efficient publishing
3. THE CloudWatch_Metrics_Adapter SHALL implement the Metrics_Port using the CloudWatch PutMetricData API
4. THE Webhook_Handler SHALL use the Metrics_Port to emit all metrics instead of calling CloudWatch directly

### Requirement 10: Web Dashboard

**User Story:** As an operator, I want a web-accessible dashboard that I can open from any browser without logging into AWS, so that I can quickly check metrics from anywhere.

#### Acceptance Criteria

1. THE Metrics_API SHALL be a Lambda function behind API Gateway that queries CloudWatch GetMetricData for all published metrics and returns them as JSON
2. THE Metrics_API SHALL require a shared API key passed via an `x-api-key` header or query parameter; requests without a valid key SHALL receive a 401 Unauthorized response
3. THE API key SHALL be stored as an environment variable (`METRICS_API_KEY`) on the Metrics_API Lambda and configurable per stage
4. THE Web_Dashboard SHALL be a static HTML page that fetches data from the Metrics_API and renders charts for all metric groups (user acquisition, engagement, feature usage, errors, payments, reminders, latency)
5. THE Web_Dashboard SHALL prompt the operator for the API key on first visit and store it in the browser's localStorage so it does not need to be re-entered on subsequent visits
6. THE Web_Dashboard SHALL allow the operator to select a date range (today, last 7 days, last 30 days) to filter displayed metrics
7. THE Web_Dashboard SHALL auto-refresh metric data at a configurable interval (default: 5 minutes)
8. THE Web_Dashboard SHALL be hosted on S3 and accessible via a public URL or CloudFront distribution
9. THE Metrics_API SHALL be deployed via the deploy script alongside existing infrastructure
