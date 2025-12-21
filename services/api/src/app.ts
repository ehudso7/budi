// Budi API App - Fastify instance for both server and serverless
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAuth } from "./lib/auth.js";
import v1Routes from "./routes/v1.js";
import webhookRoutes from "./routes/webhooks.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  // Register JWT authentication
  await registerAuth(app);

  // Register routes
  app.register(v1Routes);
  app.register(webhookRoutes);

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
