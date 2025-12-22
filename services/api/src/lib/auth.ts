// Authentication middleware and utilities
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import prisma from "./db.js";

// Extend FastifyRequest with our custom properties
declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userPlan?: import("../../generated/prisma/index.js").Plan;
  }
}

// Extend @fastify/jwt to type the JWT payload
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; email: string; name: string | null };
    user: { id: string; email: string; name: string | null };
  }
}

/**
 * Register JWT authentication plugin
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  // SECURITY: JWT_SECRET must be set in production - fail fast if missing
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: JWT_SECRET environment variable must be set in production");
    }
    console.warn("WARNING: JWT_SECRET not set. Using insecure development secret. DO NOT USE IN PRODUCTION!");
  }

  await app.register(import("@fastify/jwt"), {
    secret: jwtSecret || "budi-dev-secret-DO-NOT-USE-IN-PROD",
  });

  // Add authentication decorator
  app.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        // Check for API key first
        const apiKey = request.headers["x-api-key"] as string;
        if (apiKey) {
          const user = await prisma.user.findUnique({
            where: { apiKey },
            select: { id: true, email: true, name: true, plan: true },
          });
          if (user) {
            request.userId = user.id;
            request.user = { id: user.id, email: user.email, name: user.name };
            request.userPlan = user.plan;
            return;
          }
        }

        // Fall back to JWT
        await request.jwtVerify();
        const payload = request.user as { id: string; email: string; name: string | null };
        request.userId = payload.id;
        request.user = payload;

        // Fetch plan from database for JWT auth
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.id },
          select: { plan: true },
        });
        request.userPlan = dbUser?.plan || "FREE";
      } catch {
        reply.status(401).send({ error: "Unauthorized", message: "Invalid or missing authentication" });
      }
    }
  );
}

/**
 * Optional authentication - sets user if present but doesn't require it
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const apiKey = request.headers["x-api-key"] as string;
    if (apiKey) {
      const user = await prisma.user.findUnique({
        where: { apiKey },
        select: { id: true, email: true, name: true, plan: true },
      });
      if (user) {
        request.userId = user.id;
        request.user = { id: user.id, email: user.email, name: user.name };
        request.userPlan = user.plan;
        return;
      }
    }

    // Try JWT if no API key
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      await request.jwtVerify();
      const payload = request.user as { id: string; email: string; name: string | null };
      request.userId = payload.id;
      request.user = payload;

      // Fetch plan from database
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { plan: true },
      });
      request.userPlan = dbUser?.plan || "FREE";
    }
  } catch {
    // Ignore auth errors for optional auth
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(
  app: FastifyInstance,
  user: { id: string; email: string; name: string | null }
): string {
  return app.jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}
