// Authentication middleware and utilities
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import prisma from "./db.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    user?: {
      id: string;
      email: string;
      name: string | null;
    };
  }
}

/**
 * Register JWT authentication plugin
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/jwt"), {
    secret: process.env.JWT_SECRET || "budi-dev-secret",
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
            select: { id: true, email: true, name: true },
          });
          if (user) {
            request.userId = user.id;
            request.user = user;
            return;
          }
        }

        // Fall back to JWT
        await request.jwtVerify();
        const payload = request.user as { id: string; email: string; name: string | null };
        request.userId = payload.id;
        request.user = payload;
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
        select: { id: true, email: true, name: true },
      });
      if (user) {
        request.userId = user.id;
        request.user = user;
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
