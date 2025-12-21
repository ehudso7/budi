// Rate limiting middleware for Fastify
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Plan } from "../../generated/prisma/index.js";
import { checkRateLimit, checkOperationLimit } from "../lib/rateLimit.js";

// Extend FastifyRequest to include user plan
declare module "fastify" {
  interface FastifyRequest {
    userPlan?: Plan;
  }
}

/**
 * Register rate limiting middleware
 */
export async function registerRateLimiter(app: FastifyInstance): Promise<void> {
  // Add rate limit headers hook
  app.addHook("onSend", async (request, reply) => {
    // Add rate limit headers if we have them
    const headers = request.rateLimitHeaders;
    if (headers) {
      reply.header("X-RateLimit-Limit", headers.limit);
      reply.header("X-RateLimit-Remaining", headers.remaining);
      reply.header("X-RateLimit-Reset", headers.resetAt);
    }
  });
}

// Store rate limit headers on request
declare module "fastify" {
  interface FastifyRequest {
    rateLimitHeaders?: {
      limit: number;
      remaining: number;
      resetAt: string;
    };
  }
}

/**
 * Rate limit check preHandler
 * Use this as a preHandler on routes that need rate limiting
 */
export async function rateLimitHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.userId;
  const plan = request.userPlan || "FREE";

  if (!userId) {
    // Anonymous requests get stricter limits
    const result = await checkRateLimit("anonymous:" + request.ip, "FREE");

    if (!result.allowed) {
      reply.status(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please authenticate for higher limits.",
        retryAfter: result.retryAfter,
      });
      return;
    }

    request.rateLimitHeaders = {
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt.toISOString(),
    };
    return;
  }

  // Check rate limit for authenticated user
  const result = await checkRateLimit(userId, plan);

  request.rateLimitHeaders = {
    limit: result.limit,
    remaining: result.remaining,
    resetAt: result.resetAt.toISOString(),
  };

  if (!result.allowed) {
    reply.status(429).send({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
      retryAfter: result.retryAfter,
      limit: result.limit,
      plan,
    });
    return;
  }
}

/**
 * Create an operation-specific rate limiter
 * Use for expensive operations like uploads, analysis, mastering
 */
export function createOperationLimiter(operation: string) {
  return async function operationRateLimiter(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = request.userId;
    const plan = request.userPlan || "FREE";

    if (!userId) {
      reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required for this operation",
      });
      return;
    }

    const result = await checkOperationLimit(userId, operation, plan);

    if (!result.allowed) {
      reply.status(429).send({
        error: "Too Many Requests",
        message: `Hourly limit for ${operation.replace(":", " ")} exceeded.`,
        retryAfter: result.retryAfter,
        limit: result.limit,
        plan,
      });
      return;
    }
  };
}

// Pre-built operation limiters
export const trackUploadLimiter = createOperationLimiter("track:upload");
export const trackAnalyzeLimiter = createOperationLimiter("track:analyze");
export const trackMasterLimiter = createOperationLimiter("track:master");
export const trackExportLimiter = createOperationLimiter("track:export");
export const projectCreateLimiter = createOperationLimiter("project:create");
