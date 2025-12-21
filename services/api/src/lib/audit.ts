// Audit logging for security compliance
import prisma from "./db.js";
import type { FastifyRequest } from "fastify";

export type AuditAction =
  | "login"
  | "logout"
  | "api_key_create"
  | "api_key_revoke"
  | "project_create"
  | "project_delete"
  | "track_upload"
  | "track_analyze"
  | "track_master"
  | "track_export"
  | "track_delete"
  | "subscription_create"
  | "subscription_update"
  | "subscription_cancel"
  | "payment_success"
  | "payment_failed"
  | "data_export"
  | "data_delete"
  | "settings_change";

export type AuditResource =
  | "user"
  | "project"
  | "track"
  | "subscription"
  | "payment"
  | "api_key"
  | "settings";

export interface AuditLogData {
  userId?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  const { userId, action, resource, resourceId, metadata, request } = data;

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        ip: request ? getClientIp(request) : undefined,
        userAgent: request?.headers["user-agent"] || undefined,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });
  } catch (error) {
    // Log but don't throw - audit logging should never break the request
    console.error("Failed to create audit log:", error);
  }
}

/**
 * Get client IP from request, handling proxies
 */
function getClientIp(request: FastifyRequest): string | undefined {
  // Check common proxy headers
  const forwardedFor = request.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(",")[0].trim();
  }

  const realIp = request.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return request.ip;
}

/**
 * Audit log helper for authentication events
 */
export async function auditAuth(
  userId: string,
  action: "login" | "logout",
  request: FastifyRequest,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "user",
    resourceId: userId,
    metadata: {
      ...metadata,
      method: action === "login" ? (request.headers["x-api-key"] ? "api_key" : "jwt") : undefined,
    },
    request,
  });
}

/**
 * Audit log helper for project events
 */
export async function auditProject(
  userId: string,
  action: "project_create" | "project_delete",
  projectId: string,
  request: FastifyRequest,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "project",
    resourceId: projectId,
    metadata,
    request,
  });
}

/**
 * Audit log helper for track events
 */
export async function auditTrack(
  userId: string,
  action: "track_upload" | "track_analyze" | "track_master" | "track_export" | "track_delete",
  trackId: string,
  request: FastifyRequest,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "track",
    resourceId: trackId,
    metadata,
    request,
  });
}

/**
 * Audit log helper for subscription events
 */
export async function auditSubscription(
  userId: string,
  action: "subscription_create" | "subscription_update" | "subscription_cancel",
  subscriptionId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "subscription",
    resourceId: subscriptionId,
    metadata,
  });
}

/**
 * Audit log helper for payment events
 */
export async function auditPayment(
  userId: string,
  action: "payment_success" | "payment_failed",
  paymentId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "payment",
    resourceId: paymentId,
    metadata,
  });
}

/**
 * Audit log helper for GDPR data requests
 */
export async function auditDataRequest(
  userId: string,
  action: "data_export" | "data_delete",
  request: FastifyRequest
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "user",
    resourceId: userId,
    request,
  });
}

/**
 * Get audit logs for a user (for GDPR data export)
 */
export async function getUserAuditLogs(
  userId: string,
  options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
) {
  const { limit = 100, offset = 0, startDate, endDate } = options;

  return prisma.auditLog.findMany({
    where: {
      userId,
      createdAt: {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

/**
 * Get audit logs for a resource
 */
export async function getResourceAuditLogs(
  resource: AuditResource,
  resourceId: string,
  options: { limit?: number } = {}
) {
  const { limit = 50 } = options;

  return prisma.auditLog.findMany({
    where: { resource, resourceId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
