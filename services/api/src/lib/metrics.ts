// Metrics collection and observability
import redis from "./redis.js";

// Metric types
export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricLabels {
  [key: string]: string | number;
}

// Default histogram buckets for latency (in ms)
const LATENCY_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Increment a counter metric
 */
export async function incrementCounter(
  name: string,
  labels: MetricLabels = {},
  value: number = 1
): Promise<void> {
  const key = formatMetricKey("counter", name, labels);
  await redis.incrbyfloat(key, value);

  // Set TTL for automatic cleanup (7 days)
  await redis.expire(key, 7 * 24 * 60 * 60);
}

/**
 * Set a gauge metric
 */
export async function setGauge(
  name: string,
  value: number,
  labels: MetricLabels = {}
): Promise<void> {
  const key = formatMetricKey("gauge", name, labels);
  await redis.set(key, value.toString(), "EX", 7 * 24 * 60 * 60);
}

/**
 * Record a histogram observation
 */
export async function recordHistogram(
  name: string,
  value: number,
  labels: MetricLabels = {}
): Promise<void> {
  const baseKey = formatMetricKey("histogram", name, labels);

  // Store in Redis sorted set for percentile calculations
  const timestamp = Date.now();
  await redis.zadd(`${baseKey}:values`, timestamp, `${timestamp}:${value}`);

  // Increment count
  await redis.incr(`${baseKey}:count`);

  // Update sum
  await redis.incrbyfloat(`${baseKey}:sum`, value);

  // Update bucket counts
  for (const bucket of LATENCY_BUCKETS) {
    if (value <= bucket) {
      await redis.incr(`${baseKey}:bucket:${bucket}`);
    }
  }

  // Set TTL
  await redis.expire(`${baseKey}:values`, 24 * 60 * 60);
  await redis.expire(`${baseKey}:count`, 24 * 60 * 60);
  await redis.expire(`${baseKey}:sum`, 24 * 60 * 60);
}

/**
 * Format a metric key for Redis storage
 */
function formatMetricKey(
  type: MetricType,
  name: string,
  labels: MetricLabels
): string {
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");

  return `metrics:${type}:${name}${labelStr ? `:${labelStr}` : ""}`;
}

// Common metrics
export const Metrics = {
  // HTTP metrics
  httpRequestsTotal: (method: string, path: string, status: number) =>
    incrementCounter("http_requests_total", { method, path, status }),

  httpRequestDuration: (method: string, path: string, durationMs: number) =>
    recordHistogram("http_request_duration_ms", durationMs, { method, path }),

  // Job metrics
  jobsCreated: (type: string) =>
    incrementCounter("jobs_created_total", { type }),

  jobsCompleted: (type: string, success: boolean) =>
    incrementCounter("jobs_completed_total", { type, success: success ? "true" : "false" }),

  jobDuration: (type: string, durationMs: number) =>
    recordHistogram("job_duration_ms", durationMs, { type }),

  // User metrics
  activeUsers: (count: number) =>
    setGauge("active_users", count),

  signups: () =>
    incrementCounter("user_signups_total"),

  // Subscription metrics
  subscriptions: (plan: string, action: "created" | "canceled" | "renewed") =>
    incrementCounter("subscriptions_total", { plan, action }),

  // Error metrics
  errors: (type: string, source: string) =>
    incrementCounter("errors_total", { type, source }),

  // Queue metrics
  queueSize: (queue: string, size: number) =>
    setGauge("queue_size", size, { queue }),

  queueLatency: (queue: string, latencyMs: number) =>
    recordHistogram("queue_latency_ms", latencyMs, { queue }),
};

/**
 * Get all metrics for Prometheus scraping
 */
export async function getPrometheusMetrics(): Promise<string> {
  const lines: string[] = [];

  // Get all metric keys
  const counterKeys = await redis.keys("metrics:counter:*");
  const gaugeKeys = await redis.keys("metrics:gauge:*");

  // Format counters
  for (const key of counterKeys) {
    const value = await redis.get(key);
    if (value) {
      const metricName = key.replace("metrics:counter:", "");
      lines.push(formatPrometheusMetric(metricName, parseFloat(value)));
    }
  }

  // Format gauges
  for (const key of gaugeKeys) {
    const value = await redis.get(key);
    if (value) {
      const metricName = key.replace("metrics:gauge:", "");
      lines.push(formatPrometheusMetric(metricName, parseFloat(value)));
    }
  }

  return lines.join("\n");
}

function formatPrometheusMetric(name: string, value: number): string {
  // Parse name and labels
  const [metricName, ...labelParts] = name.split(":");
  const labels = labelParts.join(",");

  if (labels) {
    return `${metricName}{${labels}} ${value}`;
  }
  return `${metricName} ${value}`;
}

/**
 * Fastify hook to record request metrics
 */
export function createMetricsHook() {
  return async function metricsHook(request: any, reply: any) {
    const start = Date.now();

    reply.then(() => {
      const duration = Date.now() - start;
      const path = request.routerPath || request.url.split("?")[0];

      Metrics.httpRequestsTotal(request.method, path, reply.statusCode);
      Metrics.httpRequestDuration(request.method, path, duration);
    });
  };
}
