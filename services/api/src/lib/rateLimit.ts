// Redis-based sliding window rate limiter
import redis from "./redis.js";
import type { Plan } from "@prisma/client";

// Rate limit configuration by plan
const RATE_LIMITS: Record<Plan, { requestsPerMinute: number; requestsPerHour: number }> = {
  FREE: { requestsPerMinute: 10, requestsPerHour: 100 },
  PRO: { requestsPerMinute: 60, requestsPerHour: 1000 },
  ENTERPRISE: { requestsPerMinute: 300, requestsPerHour: 10000 },
};

// Burst limits for specific operations
const OPERATION_LIMITS: Record<string, Record<Plan, number>> = {
  "track:upload": { FREE: 5, PRO: 50, ENTERPRISE: 500 },
  "track:analyze": { FREE: 10, PRO: 100, ENTERPRISE: 1000 },
  "track:master": { FREE: 5, PRO: 50, ENTERPRISE: 500 },
  "track:export": { FREE: 10, PRO: 100, ENTERPRISE: 1000 },
  "project:create": { FREE: 3, PRO: 30, ENTERPRISE: 300 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number;
}

/**
 * Check rate limit using sliding window algorithm
 */
export async function checkRateLimit(
  userId: string,
  plan: Plan,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const limits = RATE_LIMITS[plan];
  const limit = windowSeconds === 60 ? limits.requestsPerMinute : limits.requestsPerHour;
  const key = `rate:${userId}:${windowSeconds}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Use Redis pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove old entries outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current requests in window
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now, `${now}-${Math.random()}`);

  // Set expiry to clean up old keys
  pipeline.expire(key, windowSeconds + 1);

  const results = await pipeline.exec();
  const currentCount = (results?.[1]?.[1] as number) || 0;

  const resetAt = new Date(now + windowSeconds * 1000);
  const remaining = Math.max(0, limit - currentCount - 1);
  const allowed = currentCount < limit;

  return {
    allowed,
    remaining,
    limit,
    resetAt,
    retryAfter: allowed ? undefined : Math.ceil((windowStart + windowSeconds * 1000 - now) / 1000),
  };
}

/**
 * Check operation-specific rate limit (per hour)
 */
export async function checkOperationLimit(
  userId: string,
  operation: string,
  plan: Plan
): Promise<RateLimitResult> {
  const limits = OPERATION_LIMITS[operation];
  if (!limits) {
    // No limit defined for this operation
    return { allowed: true, remaining: -1, limit: -1, resetAt: new Date() };
  }

  const limit = limits[plan];
  const key = `op:${userId}:${operation}`;
  const now = Date.now();
  const hourAgo = now - 3600 * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, hourAgo);
  pipeline.zcard(key);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.expire(key, 3601);

  const results = await pipeline.exec();
  const currentCount = (results?.[1]?.[1] as number) || 0;

  const resetAt = new Date(now + 3600 * 1000);
  const remaining = Math.max(0, limit - currentCount - 1);
  const allowed = currentCount < limit;

  return {
    allowed,
    remaining,
    limit,
    resetAt,
    retryAfter: allowed ? undefined : 3600,
  };
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  userId: string,
  plan: Plan
): Promise<{ minute: RateLimitResult; hour: RateLimitResult }> {
  const limits = RATE_LIMITS[plan];
  const now = Date.now();

  const minuteKey = `rate:${userId}:60`;
  const hourKey = `rate:${userId}:3600`;

  const pipeline = redis.pipeline();
  pipeline.zcount(minuteKey, now - 60000, now);
  pipeline.zcount(hourKey, now - 3600000, now);

  const results = await pipeline.exec();
  const minuteCount = (results?.[0]?.[1] as number) || 0;
  const hourCount = (results?.[1]?.[1] as number) || 0;

  return {
    minute: {
      allowed: minuteCount < limits.requestsPerMinute,
      remaining: Math.max(0, limits.requestsPerMinute - minuteCount),
      limit: limits.requestsPerMinute,
      resetAt: new Date(now + 60000),
    },
    hour: {
      allowed: hourCount < limits.requestsPerHour,
      remaining: Math.max(0, limits.requestsPerHour - hourCount),
      limit: limits.requestsPerHour,
      resetAt: new Date(now + 3600000),
    },
  };
}

/**
 * Reset rate limits for a user (admin use)
 */
export async function resetRateLimits(userId: string): Promise<void> {
  const keys = await redis.keys(`rate:${userId}:*`);
  const opKeys = await redis.keys(`op:${userId}:*`);
  const allKeys = [...keys, ...opKeys];

  if (allKeys.length > 0) {
    await redis.del(...allKeys);
  }
}
