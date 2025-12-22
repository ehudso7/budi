// Budi API App - Fastify instance for both server and serverless
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAuth } from "./lib/auth.js";
import { registerRateLimiter } from "./middleware/rateLimiter.js";
import { registerSecurity } from "./middleware/security.js";
import v1Routes from "./routes/v1.js";
import webhookRoutes from "./routes/webhooks.js";
import billingRoutes from "./routes/billing.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.js";
import notificationRoutes from "./routes/notifications.js";
import iapRoutes from "./routes/iap.js";
import observabilityRoutes from "./routes/observability.js";
import gdprRoutes from "./routes/gdpr.js";
import { registerSwagger } from "./lib/swagger.js";
import { createMetricsHook } from "./lib/metrics.js";
import { errorHandler } from "./lib/errorTracking.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  // Register CORS - SECURITY: CORS_ORIGIN must be set in production
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: CORS_ORIGIN environment variable must be set in production");
    }
    console.warn("WARNING: CORS_ORIGIN not set. Using permissive CORS for development. DO NOT USE IN PRODUCTION!");
  }
  await app.register(cors, {
    origin: corsOrigin ? corsOrigin.split(',').map(o => o.trim()) : true,
    credentials: true,
  });

  // Register OpenAPI documentation
  await registerSwagger(app);

  // Register JWT authentication
  await registerAuth(app);

  // Register rate limiting
  await registerRateLimiter(app);

  // Register security middleware
  await registerSecurity(app);

  // Register routes
  app.register(v1Routes);
  app.register(webhookRoutes);
  app.register(billingRoutes);

  // Register Stripe webhook in encapsulated scope (needs raw body parser)
  app.register(stripeWebhookRoutes);
  app.register(notificationRoutes);
  app.register(iapRoutes);
  app.register(observabilityRoutes);
  app.register(gdprRoutes);

  // Add metrics collection hook
  app.addHook("onRequest", createMetricsHook());

  // Set custom error handler
  app.setErrorHandler(errorHandler);

  // Health check endpoint
  app.get("/health", async () => {
    return {
      ok: true,
      service: "budi-api",
      version: "1.0.0",
      time: new Date().toISOString(),
    };
  });

  // Readiness check (verifies database connection)
  app.get("/ready", async (request, reply) => {
    try {
      const { prisma } = await import("./lib/db.js");
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, database: "connected" };
    } catch (error) {
      reply.code(503);
      return { ok: false, database: "disconnected", error: String(error) };
    }
  });

  // Root endpoint
  app.get("/", async () => {
    return {
      service: "budi-api",
      version: "1.0.0",
      docs: "/docs",
    };
  });

  return app;
}
