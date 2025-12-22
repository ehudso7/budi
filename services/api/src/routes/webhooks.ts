// Webhook routes for worker callbacks
// Workers call these endpoints to report job progress and results
import type { FastifyPluginAsync } from "fastify";
import prisma from "../lib/db.js";
import type {
  AnalysisResult,
  FixResult,
  MasterResult,
  CodecPreviewResult,
  AlbumMasterResult,
  ExportResult,
} from "@budi/contracts";

const webhookRoutes: FastifyPluginAsync = async (app) => {
  // SECURITY: WEBHOOK_SECRET must be set - fail fast if missing in production
  const configuredSecret = process.env.WEBHOOK_SECRET;
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: WEBHOOK_SECRET environment variable must be set in production");
    }
    app.log.warn("WARNING: WEBHOOK_SECRET not set. Using insecure development secret.");
  }
  const webhookSecret = configuredSecret || "budi-dev-webhook-DO-NOT-USE-IN-PROD";

  app.addHook("preHandler", async (request, reply) => {
    const providedSecret = request.headers["x-webhook-secret"];
    if (providedSecret !== webhookSecret) {
      return reply.code(401).send({ error: "Invalid webhook secret" });
    }
  });

  /** Update job progress */
  app.post<{
    Params: { jobId: string };
    Body: { progress: number; message?: string };
  }>("/webhooks/jobs/:jobId/progress", async (request, reply) => {
    const { jobId } = request.params;
    const { progress, message } = request.body;

    await prisma.job.update({
      where: { id: jobId },
      data: {
        progress: Math.min(100, Math.max(0, progress)),
        message,
        status: "PROCESSING",
        startedAt: { set: new Date() },
      },
    });

    reply.send({ ok: true });
  });

  /** Report analysis job completion */
  app.post<{ Params: { jobId: string }; Body: AnalysisResult }>(
    "/webhooks/jobs/:jobId/analysis",
    async (request, reply) => {
      const { jobId } = request.params;
      const result = request.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || !job.trackId) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (result.status === "completed" && result.data) {
        // Create analysis report
        await prisma.analysisReport.upsert({
          where: { trackId: job.trackId },
          create: {
            trackId: job.trackId,
            integratedLufs: result.data.integratedLufs,
            loudnessRange: result.data.loudnessRange,
            shortTermMax: result.data.shortTermMax,
            momentaryMax: result.data.momentaryMax,
            samplePeak: result.data.samplePeak,
            truePeak: result.data.truePeak,
            spectralCentroid: result.data.spectralCentroid,
            spectralRolloff: result.data.spectralRolloff,
            stereoCorrelation: result.data.stereoCorrelation,
            stereoWidth: result.data.stereoWidth,
            hasClipping: result.data.hasClipping,
            hasDcOffset: result.data.hasDcOffset,
            dcOffsetValue: result.data.dcOffsetValue,
            clippedSamples: result.data.clippedSamples,
            sampleRate: result.data.sampleRate,
            bitDepth: result.data.bitDepth,
            channels: result.data.channels,
            durationSecs: result.data.durationSecs,
            reportUrl: result.data.reportUrl,
          },
          update: {
            integratedLufs: result.data.integratedLufs,
            loudnessRange: result.data.loudnessRange,
            shortTermMax: result.data.shortTermMax,
            momentaryMax: result.data.momentaryMax,
            samplePeak: result.data.samplePeak,
            truePeak: result.data.truePeak,
            spectralCentroid: result.data.spectralCentroid,
            spectralRolloff: result.data.spectralRolloff,
            stereoCorrelation: result.data.stereoCorrelation,
            stereoWidth: result.data.stereoWidth,
            hasClipping: result.data.hasClipping,
            hasDcOffset: result.data.hasDcOffset,
            dcOffsetValue: result.data.dcOffsetValue,
            clippedSamples: result.data.clippedSamples,
            sampleRate: result.data.sampleRate,
            bitDepth: result.data.bitDepth,
            channels: result.data.channels,
            durationSecs: result.data.durationSecs,
            reportUrl: result.data.reportUrl,
          },
        });

        // Update track status
        await prisma.track.update({
          where: { id: job.trackId },
          data: { status: "ANALYZED" },
        });

        // Update job
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            resultUrl: result.data.reportUrl,
            completedAt: new Date(),
          },
        });
      } else {
        // Job failed
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: result.error,
            completedAt: new Date(),
          },
        });

        await prisma.track.update({
          where: { id: job.trackId },
          data: { status: "FAILED" },
        });
      }

      reply.send({ ok: true });
    }
  );

  /** Report fix job completion */
  app.post<{ Params: { jobId: string }; Body: FixResult }>(
    "/webhooks/jobs/:jobId/fix",
    async (request, reply) => {
      const { jobId } = request.params;
      const result = request.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || !job.trackId) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (result.status === "completed" && result.data) {
        // Update track with fixed URL
        await prisma.track.update({
          where: { id: job.trackId },
          data: {
            fixedUrl: result.data.fixedUrl,
            status: "FIXED",
          },
        });

        // Update job
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            resultUrl: result.data.fixedUrl,
            completedAt: new Date(),
          },
        });
      } else {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: result.error,
            completedAt: new Date(),
          },
        });

        await prisma.track.update({
          where: { id: job.trackId },
          data: { status: "FAILED" },
        });
      }

      reply.send({ ok: true });
    }
  );

  /** Report master job completion */
  app.post<{ Params: { jobId: string }; Body: MasterResult }>(
    "/webhooks/jobs/:jobId/master",
    async (request, reply) => {
      const { jobId } = request.params;
      const result = request.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || !job.trackId) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (result.status === "completed" && result.data) {
        // Get job payload for profile info
        const payload = job.payload as { profile?: string; loudnessTarget?: string };

        // Create master record
        const master = await prisma.master.create({
          data: {
            trackId: job.trackId,
            profile: (payload.profile?.toUpperCase() as "BALANCED" | "WARM" | "PUNCHY" | "CUSTOM") || "BALANCED",
            loudnessTarget: (payload.loudnessTarget?.toUpperCase() as "LOW" | "MEDIUM" | "HIGH") || "MEDIUM",
            wavHdUrl: result.data.wavHdUrl,
            wav16Url: result.data.wav16Url,
            mp3PreviewUrl: result.data.mp3PreviewUrl,
            finalLufs: result.data.finalLufs,
            finalTruePeak: result.data.finalTruePeak,
            passesQc: result.data.passesQc,
          },
        });

        // Create QC report if available
        if (result.data.qcReportUrl) {
          await prisma.qcReport.create({
            data: {
              masterId: master.id,
              truePeakPasses: result.data.finalTruePeak <= -2.0,
              truePeakValue: result.data.finalTruePeak,
              loudnessPasses: true, // Will be calculated properly by worker
              loudnessValue: result.data.finalLufs,
              overallPass: result.data.passesQc,
              failureReasons: result.data.passesQc ? [] : ["QC check failed"],
              reportUrl: result.data.qcReportUrl,
            },
          });
        }

        // Update track status
        await prisma.track.update({
          where: { id: job.trackId },
          data: { status: "MASTERED" },
        });

        // Update job
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            resultUrl: result.data.wavHdUrl,
            completedAt: new Date(),
          },
        });
      } else {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: result.error,
            completedAt: new Date(),
          },
        });

        await prisma.track.update({
          where: { id: job.trackId },
          data: { status: "FAILED" },
        });
      }

      reply.send({ ok: true });
    }
  );

  /** Report codec preview job completion */
  app.post<{ Params: { jobId: string }; Body: CodecPreviewResult }>(
    "/webhooks/jobs/:jobId/codec-preview",
    async (request, reply) => {
      const { jobId } = request.params;
      const result = request.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || !job.trackId) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (result.status === "completed" && result.data) {
        // Create codec preview records
        for (const preview of result.data.previews) {
          await prisma.codecPreview.create({
            data: {
              trackId: job.trackId,
              codec: preview.codec,
              previewUrl: preview.previewUrl,
              truePeakAfter: preview.truePeakAfter,
              artifactScore: preview.artifactScore,
              clippingRisk: preview.clippingRisk,
            },
          });
        }

        // Update job
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            completedAt: new Date(),
          },
        });
      } else {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: result.error,
            completedAt: new Date(),
          },
        });
      }

      reply.send({ ok: true });
    }
  );

  /** Report album master job completion */
  app.post<{ Params: { jobId: string }; Body: AlbumMasterResult }>(
    "/webhooks/jobs/:jobId/album-master",
    async (request, reply) => {
      const { jobId } = request.params;
      const result = request.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || !job.projectId) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (result.status === "completed" && result.data) {
        // Update project status
        await prisma.project.update({
          where: { id: job.projectId },
          data: { status: "MASTERED" },
        });

        // Update job
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            resultUrl: result.data.albumQcReport.reportUrl,
            completedAt: new Date(),
          },
        });
      } else {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: result.error,
            completedAt: new Date(),
          },
        });

        await prisma.project.update({
          where: { id: job.projectId },
          data: { status: "FAILED" },
        });
      }

      reply.send({ ok: true });
    }
  );

  /** Report export job completion */
  app.post<{ Params: { jobId: string }; Body: ExportResult }>(
    "/webhooks/jobs/:jobId/export",
    async (request, reply) => {
      const { jobId } = request.params;
      const result = request.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || !job.projectId) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (result.status === "completed" && result.data) {
        // Update export record
        await prisma.export.updateMany({
          where: { projectId: job.projectId, status: "PENDING" },
          data: {
            packUrl: result.data.packUrl,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        // Update project status
        await prisma.project.update({
          where: { id: job.projectId },
          data: { status: "EXPORTED" },
        });

        // Update job
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            resultUrl: result.data.packUrl,
            completedAt: new Date(),
          },
        });
      } else {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: result.error,
            completedAt: new Date(),
          },
        });

        await prisma.export.updateMany({
          where: { projectId: job.projectId, status: "PENDING" },
          data: { status: "FAILED" },
        });

        await prisma.project.update({
          where: { id: job.projectId },
          data: { status: "FAILED" },
        });
      }

      reply.send({ ok: true });
    }
  );
};

export default webhookRoutes;
