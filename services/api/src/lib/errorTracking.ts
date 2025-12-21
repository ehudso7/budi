// Error tracking and reporting
import type { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { Metrics } from "./metrics.js";
import { createAuditLog } from "./audit.js";

// Error severity levels
export type ErrorSeverity = "debug" | "info" | "warning" | "error" | "fatal";

// Error context for tracking
export interface ErrorContext {
  userId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

// Sentry-like error event
interface ErrorEvent {
  id: string;
  timestamp: string;
  level: ErrorSeverity;
  message: string;
  stack?: string;
  context: ErrorContext;
  tags: Record<string, string>;
  fingerprint: string[];
}

// In-memory error buffer for batching (would be sent to external service)
const errorBuffer: ErrorEvent[] = [];
const MAX_BUFFER_SIZE = 100;

// External error tracking configuration
const SENTRY_DSN = process.env.SENTRY_DSN;
const ERROR_WEBHOOK_URL = process.env.ERROR_WEBHOOK_URL;

/**
 * Generate unique error fingerprint for deduplication
 */
function generateFingerprint(error: Error, context: ErrorContext): string[] {
  return [
    error.name,
    error.message.replace(/\d+/g, "N"), // Replace numbers with N
    context.path || "unknown",
  ];
}

/**
 * Capture and track an error
 */
export async function captureError(
  error: Error,
  context: ErrorContext = {},
  severity: ErrorSeverity = "error"
): Promise<string> {
  const eventId = `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;

  const event: ErrorEvent = {
    id: eventId,
    timestamp: new Date().toISOString(),
    level: severity,
    message: error.message,
    stack: error.stack,
    context,
    tags: {
      environment: process.env.NODE_ENV || "development",
      service: "budi-api",
    },
    fingerprint: generateFingerprint(error, context),
  };

  // Add to buffer
  errorBuffer.push(event);
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }

  // Log to console
  console.error(`[${severity.toUpperCase()}] ${error.message}`, {
    eventId,
    stack: error.stack,
    context,
  });

  // Record metric
  await Metrics.errors(error.name, context.path || "unknown");

  // Send to external service if configured
  if (SENTRY_DSN || ERROR_WEBHOOK_URL) {
    await sendToExternalService(event);
  }

  // Audit log for significant errors
  if (severity === "error" || severity === "fatal") {
    await createAuditLog({
      userId: context.userId,
      action: "settings_change", // Using closest available action
      resource: "user",
      metadata: {
        error: error.message,
        errorType: error.name,
        eventId,
      },
    });
  }

  return eventId;
}

/**
 * Send error to external tracking service
 */
async function sendToExternalService(event: ErrorEvent): Promise<void> {
  try {
    if (ERROR_WEBHOOK_URL) {
      await fetch(ERROR_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    }

    // Sentry integration would go here
    // For now, we just log that we would send to Sentry
    if (SENTRY_DSN) {
      console.debug("[Sentry] Would send event:", event.id);
    }
  } catch {
    // Don't let error tracking failures break the app
    console.error("Failed to send error to external service");
  }
}

/**
 * Capture a message (non-error event)
 */
export async function captureMessage(
  message: string,
  severity: ErrorSeverity = "info",
  context: ErrorContext = {}
): Promise<void> {
  const error = new Error(message);
  error.name = "Message";
  await captureError(error, context, severity);
}

/**
 * Create error context from Fastify request
 */
export function contextFromRequest(request: FastifyRequest): ErrorContext {
  return {
    userId: request.userId,
    requestId: request.id,
    method: request.method,
    path: request.url.split("?")[0],
    userAgent: request.headers["user-agent"],
    ip: request.ip,
  };
}

/**
 * Fastify error handler with tracking
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const context = contextFromRequest(request);

  // Determine severity based on status code
  const statusCode = error.statusCode || 500;
  let severity: ErrorSeverity = "error";
  if (statusCode < 400) severity = "info";
  else if (statusCode < 500) severity = "warning";
  else if (statusCode >= 500) severity = "error";

  // Skip tracking for common client errors
  const skipTracking =
    statusCode === 401 || statusCode === 403 || statusCode === 404;

  let eventId: string | undefined;
  if (!skipTracking) {
    eventId = await captureError(error, context, severity);
  }

  // Send response
  reply.status(statusCode).send({
    error: error.name || "Error",
    message: error.message,
    statusCode,
    ...(eventId && { eventId }),
  });
}

/**
 * Get recent errors (for admin dashboard)
 */
export function getRecentErrors(limit: number = 50): ErrorEvent[] {
  return errorBuffer.slice(-limit).reverse();
}

/**
 * Clear error buffer (for testing)
 */
export function clearErrorBuffer(): void {
  errorBuffer.length = 0;
}

/**
 * Health check for error tracking
 */
export function getErrorTrackingHealth(): {
  bufferSize: number;
  externalConfigured: boolean;
} {
  return {
    bufferSize: errorBuffer.length,
    externalConfigured: !!(SENTRY_DSN || ERROR_WEBHOOK_URL),
  };
}
