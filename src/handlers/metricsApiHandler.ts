// Metrics API Handler — serves CloudWatch metric data as JSON for the web dashboard

import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import { loadConfig } from '../config';

const NAMESPACE = 'SmartMealPlanner';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-api-key',
};

const VALID_RANGES = ['today', '7d', '30d'] as const;
type Range = (typeof VALID_RANGES)[number];

interface APIGatewayProxyEvent {
  httpMethod: string;
  queryStringParameters: Record<string, string | undefined> | null;
  headers: Record<string, string | undefined>;
}

interface APIGatewayProxyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

interface TimeSeriesData {
  timestamps: string[];
  values: number[];
}

interface TimeSeriesGroup {
  [metricName: string]: TimeSeriesData;
}

interface MetricsApiResponse {
  range: Range;
  generatedAt: string;
  metrics: {
    userAcquisition: TimeSeriesGroup;
    engagement: TimeSeriesGroup;
    featureUsage: TimeSeriesGroup;
    errors: TimeSeriesGroup;
    payments: TimeSeriesGroup;
    reminders: TimeSeriesGroup;
    latency: TimeSeriesGroup;
  };
}

/** Metric groups and their metric names */
const METRIC_GROUPS: Record<string, string[]> = {
  userAcquisition: ['NewUser', 'OnboardingComplete', 'OnboardingStep', 'ReachedPayment'],
  engagement: ['MessageReceived', 'DailyActiveUser'],
  featureUsage: ['PlanGenerated', 'GroceryListViewed', 'CookMenuSent', 'PlanModified', 'MealSwapped'],
  errors: ['WebhookError', 'PaymentWebhookError', 'DailyReminderFailure', 'WeeklyReminderFailure', 'InvalidPaymentSignature', 'InvalidInput'],
  payments: ['SubscriptionActivated', 'PaymentCaptured'],
  reminders: ['DailyReminderSent', 'WeeklyReminderSent', 'ExpiredPlanPromptSent'],
};

/** Latency percentiles need separate stat queries */
const LATENCY_STATS = ['p50', 'p90', 'p99'] as const;

function getTimeRange(range: Range): { start: Date; end: Date; period: number } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { start, end, period: 300 }; // 5-minute intervals
    case '7d':
      start.setDate(start.getDate() - 7);
      return { start, end, period: 3600 }; // 1-hour intervals
    case '30d':
      start.setDate(start.getDate() - 30);
      return { start, end, period: 86400 }; // 1-day intervals
  }
}

function buildMetricQueries(range: Range): MetricDataQuery[] {
  const queries: MetricDataQuery[] = [];
  const { period } = getTimeRange(range);

  // Sum queries for all standard metric groups
  for (const [, metrics] of Object.entries(METRIC_GROUPS)) {
    for (const metricName of metrics) {
      const id = metricName.charAt(0).toLowerCase() + metricName.slice(1);
      queries.push({
        Id: id.replace(/[^a-zA-Z0-9_]/g, '_'),
        MetricStat: {
          Metric: {
            Namespace: NAMESPACE,
            MetricName: metricName,
          },
          Period: period,
          Stat: 'Sum',
        },
      });
    }
  }

  // Latency percentile queries
  for (const stat of LATENCY_STATS) {
    queries.push({
      Id: `webhookLatency_${stat}`,
      MetricStat: {
        Metric: {
          Namespace: NAMESPACE,
          MetricName: 'WebhookLatency',
        },
        Period: period,
        Stat: stat,
      },
    });
  }

  return queries;
}

function buildResponse(metrics: Record<string, TimeSeriesGroup>, range: Range): MetricsApiResponse {
  return {
    range,
    generatedAt: new Date().toISOString(),
    metrics: {
      userAcquisition: metrics.userAcquisition ?? {},
      engagement: metrics.engagement ?? {},
      featureUsage: metrics.featureUsage ?? {},
      errors: metrics.errors ?? {},
      payments: metrics.payments ?? {},
      reminders: metrics.reminders ?? {},
      latency: metrics.latency ?? {},
    },
  };
}

/** Map a metric name back to its group */
function getGroupForMetric(metricName: string): string | undefined {
  for (const [group, metrics] of Object.entries(METRIC_GROUPS)) {
    if (metrics.includes(metricName)) return group;
  }
  return undefined;
}

export async function metricsApiHandler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'GET,OPTIONS' },
      body: '',
    };
  }

  const config = loadConfig();

  // Validate API key
  const apiKey =
    event.headers?.['x-api-key'] ??
    event.headers?.['X-Api-Key'] ??
    event.queryStringParameters?.apiKey;

  if (!config.metricsApiKey || !apiKey || apiKey !== config.metricsApiKey) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // Validate range parameter
  const rangeParam = event.queryStringParameters?.range ?? 'today';
  if (!VALID_RANGES.includes(rangeParam as Range)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Invalid range. Must be one of: ${VALID_RANGES.join(', ')}` }),
    };
  }
  const range = rangeParam as Range;

  try {
    const cwClient = new CloudWatchClient({});
    const { start, end } = getTimeRange(range);
    const queries = buildMetricQueries(range);

    const command = new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: start,
      EndTime: end,
    });

    const result = await cwClient.send(command);
    const groups: Record<string, TimeSeriesGroup> = {};

    // Process results
    for (const metricResult of result.MetricDataResults ?? []) {
      const id = metricResult.Id ?? '';
      const timestamps = (metricResult.Timestamps ?? []).map((t) => t!.toISOString());
      const values = metricResult.Values ?? [];

      // Check if this is a latency percentile
      if (id.startsWith('webhookLatency_')) {
        const stat = id.replace('webhookLatency_', '');
        if (!groups.latency) groups.latency = {};
        groups.latency[`WebhookLatency_${stat}`] = { timestamps, values };
        continue;
      }

      // Find the original metric name from the id
      const metricName = findMetricNameFromId(id);
      if (metricName) {
        const group = getGroupForMetric(metricName);
        if (group) {
          if (!groups[group]) groups[group] = {};
          groups[group][metricName] = { timestamps, values };
        }
      }
    }

    const response = buildResponse(groups, range);
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[metricsApi] Error querying CloudWatch:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/** Reverse the ID generation to find the original metric name */
function findMetricNameFromId(id: string): string | undefined {
  for (const metrics of Object.values(METRIC_GROUPS)) {
    for (const metricName of metrics) {
      const generatedId = (metricName.charAt(0).toLowerCase() + metricName.slice(1)).replace(/[^a-zA-Z0-9_]/g, '_');
      if (generatedId === id) return metricName;
    }
  }
  return undefined;
}

export const handler = metricsApiHandler;
