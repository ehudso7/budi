// Observability routes for metrics and health checks
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { DLQStatus } from "@prisma/client";
import { getPrometheusMetrics } from "../lib/metrics.js";
import { getRecentErrors, getErrorTrackingHealth } from "../lib/errorTracking.js";
import { getAllCircuitStatus, CircuitBreakers } from "../lib/circuitBreaker.js";
import { getDLQStats, getFailedJobs, retryJob } from "../lib/dlq.js";
import prisma from "../lib/db.js";
import redis from "../lib/redis.js";

const observabilityRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Prometheus-compatible metrics endpoint
   */
  app.get("/metrics", async (_request, reply) => {
    try {
      const metrics = await getPrometheusMetrics();
      reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      return metrics;
    } catch {
      return reply.code(500).send({ error: "Failed to collect metrics" });
    }
  });

  /**
   * Detailed health check with dependencies
   */
  app.get("/health/detailed", async (_request, reply) => {
    const checks: Record<string, { status: "healthy" | "unhealthy"; latencyMs?: number; error?: string }> = {};

    // Check database
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
    } catch (error) {
      checks.database = { status: "unhealthy", error: String(error) };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: "healthy", latencyMs: Date.now() - redisStart };
    } catch (error) {
      checks.redis = { status: "unhealthy", error: String(error) };
    }

    // Error tracking health
    const errorHealth = getErrorTrackingHealth();
    checks.errorTracking = {
      status: "healthy",
      latencyMs: 0,
    };

    // Overall status
    const allHealthy = Object.values(checks).every((c) => c.status === "healthy");

    if (!allHealthy) {
      reply.code(503);
    }

    return {
      status: allHealthy ? "healthy" : "degraded",
      version: "1.0.0",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
      errorTracking: errorHealth,
    };
  });

  /**
   * Recent errors endpoint (protected, for debugging)
   */
  app.get(
    "/api/v1/admin/errors",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Check if user is admin (for now, just check if they have enterprise plan)
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      const errors = getRecentErrors(50);
      return { errors };
    }
  );

  /**
   * Service info endpoint
   */
  app.get("/api/v1/info", async () => {
    return {
      service: "budi-api",
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      features: {
        billing: !!process.env.STRIPE_SECRET_KEY,
        pushNotifications: !!process.env.APNS_KEY_ID,
        iap: !!process.env.APPLE_ISSUER_ID,
      },
    };
  });

  /**
   * Queue status endpoint
   */
  app.get(
    "/api/v1/admin/queues",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      try {
        const queues = ["jobs", "dsp-jobs", "codec-jobs"];
        const status: Record<string, number> = {};

        for (const queue of queues) {
          status[queue] = await redis.llen(queue);
        }

        return { queues: status };
      } catch {
        return reply.code(500).send({ error: "Failed to get queue status" });
      }
    }
  );

  /**
   * Database stats endpoint
   */
  app.get(
    "/api/v1/admin/stats",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      try {
        const [
          userCount,
          projectCount,
          trackCount,
          jobCount,
          subscriptionStats,
        ] = await Promise.all([
          prisma.user.count(),
          prisma.project.count(),
          prisma.track.count(),
          prisma.job.count(),
          prisma.user.groupBy({
            by: ["plan"],
            _count: true,
          }),
        ]);

        return {
          users: userCount,
          projects: projectCount,
          tracks: trackCount,
          jobs: jobCount,
          subscriptions: subscriptionStats.reduce(
            (acc: Record<string, number>, s: { plan: string; _count: number }) => ({
              ...acc,
              [s.plan]: s._count,
            }),
            {} as Record<string, number>
          ),
        };
      } catch {
        return reply.code(500).send({ error: "Failed to get stats" });
      }
    }
  );

  /**
   * Circuit breaker status
   */
  app.get(
    "/api/v1/admin/circuits",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      try {
        const circuits = await getAllCircuitStatus();
        return { circuits };
      } catch {
        return reply.code(500).send({ error: "Failed to get circuit status" });
      }
    }
  );

  /**
   * Reset a circuit breaker
   */
  app.post<{
    Params: { name: string };
  }>(
    "/api/v1/admin/circuits/:name/reset",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      const { name } = request.params;
      const breaker = CircuitBreakers[name as keyof typeof CircuitBreakers];

      if (!breaker) {
        return reply.code(404).send({ error: "Circuit breaker not found" });
      }

      await breaker.reset();
      return { success: true, message: `Circuit '${name}' reset to closed` };
    }
  );

  /**
   * Dead letter queue status
   */
  app.get(
    "/api/v1/admin/dlq",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      try {
        const stats = await getDLQStats();
        return { stats };
      } catch {
        return reply.code(500).send({ error: "Failed to get DLQ stats" });
      }
    }
  );

  /**
   * Get failed jobs from DLQ
   */
  app.get<{
    Querystring: {
      status?: string;
      queue?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/api/v1/admin/dlq/jobs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      try {
        const { status, queue, limit, offset } = request.query;
        const result = await getFailedJobs({
          status: status as DLQStatus | undefined,
          queue,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });
        return result;
      } catch {
        return reply.code(500).send({ error: "Failed to get failed jobs" });
      }
    }
  );

  /**
   * Retry a failed job
   */
  app.post<{
    Params: { id: string };
  }>(
    "/api/v1/admin/dlq/jobs/:id/retry",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.userPlan !== "ENTERPRISE") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Admin access required",
        });
      }

      const { id } = request.params;

      try {
        const success = await retryJob(id);
        if (success) {
          return { success: true, message: "Job queued for retry" };
        } else {
          return reply.code(400).send({ error: "Failed to retry job" });
        }
      } catch {
        return reply.code(500).send({ error: "Failed to retry job" });
      }
    }
  );
};

export default observabilityRoutes;
