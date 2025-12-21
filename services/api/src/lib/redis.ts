// Redis client for job queue (lazy-loaded for serverless)
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Lazy singleton for serverless environments
let _redis: Redis | null = null;
let _connectionFailed = false;

/**
 * Get Redis client (lazy initialization)
 * Returns null if connection previously failed to avoid repeated timeouts
 */
export function getRedis(): Redis | null {
  if (_connectionFailed) {
    return null;
  }

  if (!_redis) {
    _redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 2) {
          _connectionFailed = true;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
      },
      connectTimeout: 5000,
      lazyConnect: true,
    });

    _redis.on("error", (err) => {
      console.error("Redis connection error:", err.message);
      _connectionFailed = true;
    });
  }

  return _redis;
}

// Legacy export for backwards compatibility (lazy getter)
export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    const client = getRedis();
    if (!client) {
      // Return no-op functions for graceful degradation
      if (typeof prop === "string") {
        return async () => {
          console.warn(`Redis unavailable, skipping operation: ${prop}`);
          return null;
        };
      }
    }
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Job queue names
export const QUEUES = {
  JOBS: "jobs",
  DSP_JOBS: "dsp-jobs",
  CODEC_JOBS: "codec-jobs",
  RESULTS: "job-results",
} as const;

/**
 * Enqueue a job to the specified queue
 */
export async function enqueueJob<T extends object>(
  queue: string,
  job: T
): Promise<void> {
  await redis.lpush(queue, JSON.stringify(job));
}

/**
 * Dequeue a job from the specified queue (blocking with timeout)
 */
export async function dequeueJob(
  queue: string,
  timeoutSecs = 5
): Promise<string | null> {
  const result = await redis.brpop(queue, timeoutSecs);
  return result ? result[1] : null;
}

/**
 * Publish a job result
 */
export async function publishResult(jobId: string, result: object): Promise<void> {
  await redis.publish(`job:${jobId}`, JSON.stringify(result));
  // Also store in hash for polling
  await redis.hset(QUEUES.RESULTS, jobId, JSON.stringify(result));
}

/**
 * Get a job result by ID
 */
export async function getJobResult(jobId: string): Promise<object | null> {
  const result = await redis.hget(QUEUES.RESULTS, jobId);
  return result ? JSON.parse(result) : null;
}

/**
 * Subscribe to job results
 */
export function createSubscriber(): Redis | null {
  if (_connectionFailed) {
    return null;
  }
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });
}

export default redis;
