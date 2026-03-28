import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum as CWMetricDatum,
} from '@aws-sdk/client-cloudwatch';
import type { MetricsPort, MetricDatum } from '../core/ports';

const NAMESPACE = 'SmartMealPlanner';
const BATCH_SIZE = 25;

export class CloudWatchMetricsAdapter implements MetricsPort {
  private readonly client: CloudWatchClient;

  constructor(client?: CloudWatchClient) {
    this.client = client ?? new CloudWatchClient({});
  }

  async publishMetric(
    name: string,
    value: number,
    unit: 'Count' | 'Milliseconds' | 'None',
    dimensions?: Record<string, string>,
  ): Promise<void> {
    await this.publishMetrics([{ name, value, unit, dimensions }]);
  }

  async publishMetrics(metrics: MetricDatum[]): Promise<void> {
    if (metrics.length === 0) return;

    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      const metricData: CWMetricDatum[] = batch.map((m) => ({
        MetricName: m.name,
        Value: m.value,
        Unit: m.unit,
        ...(m.dimensions
          ? {
              Dimensions: Object.entries(m.dimensions).map(([Name, Value]) => ({
                Name,
                Value,
              })),
            }
          : {}),
      }));

      await this.client.send(
        new PutMetricDataCommand({
          Namespace: NAMESPACE,
          MetricData: metricData,
        }),
      );
    }
  }
}
