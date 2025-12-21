// Plan limit enforcement
import prisma from "./db.js";
import type { Plan, UsageType } from "../../generated/prisma/index.js";

// Default plan limits (can be overridden in database)
const DEFAULT_LIMITS: Record<Plan, {
  maxProjects: number;
  maxTracksPerMonth: number;
  maxStorageGb: number;
  priorityQueue: boolean;
  hdExports: boolean;
}> = {
  FREE: {
    maxProjects: 3,
    maxTracksPerMonth: 10,
    maxStorageGb: 1,
    priorityQueue: false,
    hdExports: false,
  },
  PRO: {
    maxProjects: 25,
    maxTracksPerMonth: 100,
    maxStorageGb: 50,
    priorityQueue: true,
    hdExports: true,
  },
  ENTERPRISE: {
    maxProjects: -1, // Unlimited
    maxTracksPerMonth: -1, // Unlimited
    maxStorageGb: 500,
    priorityQueue: true,
    hdExports: true,
  },
};

export interface PlanLimits {
  maxProjects: number;
  maxTracksPerMonth: number;
  maxStorageGb: number;
  priorityQueue: boolean;
  hdExports: boolean;
}

export interface UsageStatus {
  projects: { used: number; limit: number; remaining: number };
  tracksThisMonth: { used: number; limit: number; remaining: number };
  storageGb: { used: number; limit: number; remaining: number };
}

/**
 * Get plan limits from database or defaults
 */
export async function getPlanLimits(plan: Plan): Promise<PlanLimits> {
  const dbLimits = await prisma.planLimit.findUnique({
    where: { plan },
  });

  if (dbLimits) {
    return {
      maxProjects: dbLimits.maxProjects,
      maxTracksPerMonth: dbLimits.maxTracksPerMonth,
      maxStorageGb: dbLimits.maxStorageGb,
      priorityQueue: dbLimits.priorityQueue,
      hdExports: dbLimits.hdExports,
    };
  }

  return DEFAULT_LIMITS[plan];
}

/**
 * Get current usage for a user
 */
export async function getUserUsage(userId: string): Promise<{
  projectCount: number;
  tracksThisMonth: number;
  storageBytes: number;
}> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [projectCount, tracksThisMonth] = await Promise.all([
    prisma.project.count({ where: { userId } }),
    prisma.usageRecord.count({
      where: {
        userId,
        type: "TRACK_UPLOAD",
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  // TODO: Calculate actual storage from S3/MinIO
  // For now, estimate based on track count
  const storageBytes = tracksThisMonth * 50 * 1024 * 1024; // ~50MB per track estimate

  return { projectCount, tracksThisMonth, storageBytes };
}

/**
 * Get usage status with limits
 */
export async function getUsageStatus(userId: string, plan: Plan): Promise<UsageStatus> {
  const [limits, usage] = await Promise.all([
    getPlanLimits(plan),
    getUserUsage(userId),
  ]);

  const storageGbUsed = usage.storageBytes / (1024 * 1024 * 1024);

  return {
    projects: {
      used: usage.projectCount,
      limit: limits.maxProjects,
      remaining: limits.maxProjects === -1 ? -1 : Math.max(0, limits.maxProjects - usage.projectCount),
    },
    tracksThisMonth: {
      used: usage.tracksThisMonth,
      limit: limits.maxTracksPerMonth,
      remaining: limits.maxTracksPerMonth === -1 ? -1 : Math.max(0, limits.maxTracksPerMonth - usage.tracksThisMonth),
    },
    storageGb: {
      used: Math.round(storageGbUsed * 100) / 100,
      limit: limits.maxStorageGb,
      remaining: limits.maxStorageGb === -1 ? -1 : Math.max(0, limits.maxStorageGb - storageGbUsed),
    },
  };
}

/**
 * Check if user can create a new project
 */
export async function canCreateProject(userId: string, plan: Plan): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const limits = await getPlanLimits(plan);

  if (limits.maxProjects === -1) {
    return { allowed: true };
  }

  const projectCount = await prisma.project.count({ where: { userId } });

  if (projectCount >= limits.maxProjects) {
    return {
      allowed: false,
      reason: `Project limit reached (${limits.maxProjects} projects). Upgrade your plan for more projects.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can upload a track
 */
export async function canUploadTrack(userId: string, plan: Plan): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const limits = await getPlanLimits(plan);

  if (limits.maxTracksPerMonth === -1) {
    return { allowed: true };
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const tracksThisMonth = await prisma.usageRecord.count({
    where: {
      userId,
      type: "TRACK_UPLOAD",
      createdAt: { gte: startOfMonth },
    },
  });

  if (tracksThisMonth >= limits.maxTracksPerMonth) {
    return {
      allowed: false,
      reason: `Monthly track limit reached (${limits.maxTracksPerMonth} tracks). Upgrade your plan or wait until next month.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use HD exports
 */
export async function canUseHdExports(plan: Plan): Promise<boolean> {
  const limits = await getPlanLimits(plan);
  return limits.hdExports;
}

/**
 * Check if user gets priority queue
 */
export async function hasPriorityQueue(plan: Plan): Promise<boolean> {
  const limits = await getPlanLimits(plan);
  return limits.priorityQueue;
}

/**
 * Record usage
 */
export async function recordUsage(
  userId: string,
  type: UsageType,
  quantity: number = 1,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.usageRecord.create({
    data: {
      userId,
      type,
      quantity,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
    },
  });
}

/**
 * Get usage records for billing period
 */
export async function getUsageForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  return prisma.usageRecord.groupBy({
    by: ["type"],
    where: {
      userId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: { quantity: true },
    _count: true,
  });
}
