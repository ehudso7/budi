// GDPR compliance utilities
import prisma from "./db.js";
import type { Prisma } from "../../generated/prisma/index.js";
import { getUserAuditLogs, auditDataRequest } from "./audit.js";
import type { FastifyRequest } from "fastify";

export interface UserDataExport {
  user: {
    id: string;
    email: string;
    name: string | null;
    plan: string;
    createdAt: Date;
  };
  projects: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    createdAt: Date;
    tracks: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: Date;
    }>;
  }>;
  subscription: {
    status: string;
    plan: string;
    currentPeriodEnd: Date | null;
  } | null;
  invoices: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: Date;
  }>;
  auditLogs: Array<{
    action: string;
    resource: string;
    createdAt: Date;
  }>;
  usageRecords: Array<{
    type: string;
    quantity: number;
    createdAt: Date;
  }>;
  exportedAt: Date;
}

/**
 * Export all user data (GDPR Article 20 - Right to data portability)
 */
export async function exportUserData(
  userId: string,
  request?: FastifyRequest
): Promise<UserDataExport> {
  // Fetch all user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      createdAt: true,
      projects: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          createdAt: true,
          tracks: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
      invoices: {
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      usageRecords: {
        select: {
          type: true,
          quantity: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Get audit logs
  const auditLogs = await getUserAuditLogs(userId, { limit: 1000 });

  // Log the data export request
  if (request) {
    await auditDataRequest(userId, "data_export", request);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      createdAt: user.createdAt,
    },
    projects: user.projects,
    subscription: {
      status: user.subscriptionStatus,
      plan: user.plan,
      currentPeriodEnd: user.currentPeriodEnd,
    },
    invoices: user.invoices,
    auditLogs: auditLogs.map(
      (log: { action: string; resource: string; createdAt: Date }) => ({
        action: log.action,
        resource: log.resource,
        createdAt: log.createdAt,
      })
    ),
    usageRecords: user.usageRecords,
    exportedAt: new Date(),
  };
}

/**
 * Delete all user data (GDPR Article 17 - Right to erasure)
 */
export async function deleteUserData(
  userId: string,
  request?: FastifyRequest
): Promise<{
  deleted: {
    projects: number;
    tracks: number;
    invoices: number;
    auditLogs: number;
    usageRecords: number;
    deviceTokens: number;
  };
}> {
  // Log the deletion request before deleting
  if (request) {
    await auditDataRequest(userId, "data_delete", request);
  }

  // Get counts before deletion
  const [projects, tracks, invoices, auditLogs, usageRecords, deviceTokens] =
    await Promise.all([
      prisma.project.count({ where: { userId } }),
      prisma.track.count({
        where: { project: { userId } },
      }),
      prisma.invoice.count({ where: { userId } }),
      prisma.auditLog.count({ where: { userId } }),
      prisma.usageRecord.count({ where: { userId } }),
      prisma.deviceToken.count({ where: { userId } }),
    ]);

  // Delete in correct order (respecting foreign keys)
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Delete tracks (cascade from projects)
    await tx.project.deleteMany({ where: { userId } });

    // Delete invoices
    await tx.invoice.deleteMany({ where: { userId } });

    // Delete usage records
    await tx.usageRecord.deleteMany({ where: { userId } });

    // Delete device tokens
    await tx.deviceToken.deleteMany({ where: { userId } });

    // Note: Audit logs are kept for compliance but anonymized
    await tx.auditLog.updateMany({
      where: { userId },
      data: { userId: null, ip: null, userAgent: null },
    });

    // Finally delete the user
    await tx.user.delete({ where: { id: userId } });
  });

  return {
    deleted: {
      projects,
      tracks,
      invoices,
      auditLogs, // Actually anonymized, not deleted
      usageRecords,
      deviceTokens,
    },
  };
}

/**
 * Get user consent status
 */
export async function getUserConsent(userId: string): Promise<{
  hasConsent: boolean;
  consentDate: Date | null;
  purposes: string[];
}> {
  // For now, consent is implied by registration
  // In production, you'd store explicit consent records
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) {
    return { hasConsent: false, consentDate: null, purposes: [] };
  }

  return {
    hasConsent: true,
    consentDate: user.createdAt,
    purposes: [
      "audio_processing",
      "account_management",
      "payment_processing",
      "service_improvement",
    ],
  };
}

/**
 * Record user consent
 */
export async function recordConsent(
  _userId: string,
  _purposes: string[]
): Promise<void> {
  // In production, you'd store consent in a dedicated table
  // For now, this is a placeholder
  console.log("Consent recorded");
}

/**
 * Anonymize old data for data minimization
 */
export async function anonymizeOldData(
  olderThanDays: number = 365
): Promise<{
  anonymizedAuditLogs: number;
  deletedUsageRecords: number;
}> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  // Anonymize old audit logs
  const auditResult = await prisma.auditLog.updateMany({
    where: {
      createdAt: { lt: cutoff },
      ip: { not: null },
    },
    data: {
      ip: null,
      userAgent: null,
    },
  });

  // Delete old usage records (after billing period)
  const usageResult = await prisma.usageRecord.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  return {
    anonymizedAuditLogs: auditResult.count,
    deletedUsageRecords: usageResult.count,
  };
}
