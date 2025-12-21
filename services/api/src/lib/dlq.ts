// Dead Letter Queue (DLQ) for failed job handling
import prisma from "./db.js";
import { enqueueJob } from "./redis.js";
import { Metrics } from "./metrics.js";
import { captureError } from "./errorTracking.js";
import type { DLQStatus } from "../../generated/prisma/index.js";

export interface FailedJobData {
  originalJobId: string;
  queue: string;
  payload: unknown;
  error: string;
  maxAttempts?: number;
}

/**
 * Move a failed job to the dead letter queue
 */
export async function moveToDeadLetterQueue(data: FailedJobData): Promise<string> {
  const failedJob = await prisma.failedJob.create({
    data: {
      originalJobId: data.originalJobId,
      queue: data.queue,
      payload: data.payload as object,
      error: data.error,
      maxAttempts: data.maxAttempts || 3,
      attempts: 1,
      status: "PENDING",
      nextRetryAt: calculateNextRetry(1),
    },
  });

  await Metrics.incrementCounter("dlq_jobs_added", { queue: data.queue });

  console.log(`[DLQ] Job ${data.originalJobId} moved to dead letter queue`, {
    failedJobId: failedJob.id,
    queue: data.queue,
  });

  return failedJob.id;
}

/**
 * Calculate next retry time with exponential backoff
 */
function calculateNextRetry(attempt: number): Date {
  // Exponential backoff: 1min, 5min, 30min, 2hr, 12hr, 24hr
  const delays = [60, 300, 1800, 7200, 43200, 86400];
  const delaySeconds = delays[Math.min(attempt - 1, delays.length - 1)];
  return new Date(Date.now() + delaySeconds * 1000);
}

/**
 * Process jobs in the dead letter queue that are ready for retry
 */
export async function processDLQ(): Promise<{ processed: number; failed: number }> {
  const now = new Date();
  let processed = 0;
  let failed = 0;

  // Get jobs ready for retry
  const pendingJobs = await prisma.failedJob.findMany({
    where: {
      status: "PENDING",
      nextRetryAt: { lte: now },
    },
    take: 100, // Process in batches
    orderBy: { nextRetryAt: "asc" },
  });

  for (const job of pendingJobs) {
    try {
      // Mark as retrying
      await prisma.failedJob.update({
        where: { id: job.id },
        data: { status: "RETRYING" },
      });

      // Re-enqueue the job
      await enqueueJob(job.queue, job.payload as object);

      // Mark as resolved (the worker will handle it)
      await prisma.failedJob.update({
        where: { id: job.id },
        data: { status: "RESOLVED" },
      });

      processed++;
      await Metrics.incrementCounter("dlq_jobs_retried", { queue: job.queue });
    } catch (error) {
      const newAttempts = job.attempts + 1;

      if (newAttempts >= job.maxAttempts) {
        // Exhausted all retries
        await prisma.failedJob.update({
          where: { id: job.id },
          data: {
            status: "EXHAUSTED",
            attempts: newAttempts,
          },
        });

        await Metrics.incrementCounter("dlq_jobs_exhausted", { queue: job.queue });
        await captureError(error as Error, {
          metadata: { jobId: job.originalJobId, queue: job.queue },
        });
      } else {
        // Schedule for another retry
        await prisma.failedJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            attempts: newAttempts,
            nextRetryAt: calculateNextRetry(newAttempts),
            error: String(error),
          },
        });
      }

      failed++;
    }
  }

  return { processed, failed };
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(): Promise<{
  pending: number;
  retrying: number;
  exhausted: number;
  resolved: number;
  byQueue: Record<string, number>;
}> {
  const [statusCounts, queueCounts] = await Promise.all([
    prisma.failedJob.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.failedJob.groupBy({
      by: ["queue"],
      where: { status: { in: ["PENDING", "RETRYING"] } },
      _count: true,
    }),
  ]);

  const stats = { pending: 0, retrying: 0, exhausted: 0, resolved: 0 };
  for (const s of statusCounts) {
    const key = s.status.toLowerCase() as keyof typeof stats;
    if (key in stats) {
      stats[key] = s._count;
    }
  }

  const byQueue: Record<string, number> = {};
  for (const q of queueCounts) {
    byQueue[q.queue] = q._count;
  }

  return { ...stats, byQueue };
}

/**
 * Get failed jobs with details
 */
export async function getFailedJobs(options: {
  status?: DLQStatus;
  queue?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{
  jobs: Array<{
    id: string;
    originalJobId: string;
    queue: string;
    error: string;
    attempts: number;
    maxAttempts: number;
    status: DLQStatus;
    nextRetryAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const { status, queue, limit = 50, offset = 0 } = options;

  const where = {
    ...(status && { status }),
    ...(queue && { queue }),
  };

  const [jobs, total] = await Promise.all([
    prisma.failedJob.findMany({
      where,
      select: {
        id: true,
        originalJobId: true,
        queue: true,
        error: true,
        attempts: true,
        maxAttempts: true,
        status: true,
        nextRetryAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.failedJob.count({ where }),
  ]);

  return { jobs, total };
}

/**
 * Manually retry a specific failed job
 */
export async function retryJob(failedJobId: string): Promise<boolean> {
  const job = await prisma.failedJob.findUnique({
    where: { id: failedJobId },
  });

  if (!job || job.status === "RESOLVED") {
    return false;
  }

  try {
    await prisma.failedJob.update({
      where: { id: failedJobId },
      data: { status: "RETRYING" },
    });

    await enqueueJob(job.queue, job.payload as object);

    await prisma.failedJob.update({
      where: { id: failedJobId },
      data: { status: "RESOLVED" },
    });

    return true;
  } catch (error) {
    await prisma.failedJob.update({
      where: { id: failedJobId },
      data: {
        status: "PENDING",
        error: String(error),
        nextRetryAt: calculateNextRetry(job.attempts),
      },
    });
    return false;
  }
}

/**
 * Delete resolved/exhausted jobs older than given days
 */
export async function cleanupDLQ(olderThanDays: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const { count } = await prisma.failedJob.deleteMany({
    where: {
      status: { in: ["RESOLVED", "EXHAUSTED"] },
      updatedAt: { lt: cutoff },
    },
  });

  return count;
}

/**
 * Start DLQ processor (runs periodically)
 */
export function startDLQProcessor(intervalMs: number = 60000): NodeJS.Timeout {
  console.log("[DLQ] Starting dead letter queue processor");

  return setInterval(async () => {
    try {
      const result = await processDLQ();
      if (result.processed > 0 || result.failed > 0) {
        console.log("[DLQ] Processed batch", result);
      }
    } catch (error) {
      console.error("[DLQ] Error processing dead letter queue:", error);
    }
  }, intervalMs);
}
