// Redis client for job queue
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl);

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
export function createSubscriber(): Redis {
  return new Redis(redisUrl);
}

export default redis;
