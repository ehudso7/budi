// Security middleware - headers and request validation
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Register security headers and middleware
 */
export async function registerSecurity(app: FastifyInstance): Promise<void> {
  // Add security headers to all responses
  app.addHook("onSend", async (_request, reply) => {
    // Prevent MIME type sniffing
    reply.header("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    reply.header("X-Frame-Options", "DENY");

    // XSS protection (legacy browsers)
    reply.header("X-XSS-Protection", "1; mode=block");

    // Referrer policy
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy for API responses
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");

    // Strict Transport Security (1 year)
    if (process.env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    // Remove server header for security through obscurity
    reply.removeHeader("Server");
  });

  // Request size limits
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: 1024 * 1024 }, // 1MB limit for JSON
    (_request, body, done) => {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );
}

/**
 * Validate request origin for sensitive operations
 */
export async function validateOrigin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const origin = request.headers.origin;
  const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim());

  if (process.env.NODE_ENV === "production" && origin) {
    if (!allowedOrigins.includes(origin) && !allowedOrigins.includes("*")) {
      reply.status(403).send({
        error: "Forbidden",
        message: "Invalid request origin",
      });
      return;
    }
  }
}

/**
 * Request ID middleware for tracing
 */
export async function addRequestId(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.headers["x-request-id"]) {
    request.headers["x-request-id"] = generateRequestId();
  }
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Log security-relevant events
 */
export function logSecurityEvent(
  event: "rate_limit" | "auth_failure" | "invalid_input" | "suspicious_activity",
  details: Record<string, unknown>
): void {
  console.warn("[SECURITY]", {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
}
