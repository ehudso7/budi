// V1 API Routes with full persistence
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import prisma from "../lib/db.js";
import { generateToken } from "../lib/auth.js";
import { enqueueJob, QUEUES } from "../lib/redis.js";
import { getUploadUrl, getDownloadUrl, BUCKETS, generateKey, getInternalUrl } from "../lib/s3.js";
import {
  createProjectSchema,
  importTrackSchema,
  fixTrackSchema,
  masterTrackSchema,
  codecPreviewSchema,
  albumMasterSchema,
  exportProjectSchema,
  trackExportSchema,
} from "../lib/validation.js";
import type {
  AnalyzeJob,
  FixJob,
  MasterJob,
  CodecPreviewJob,
  AlbumMasterJob,
  ExportJob,
} from "@budi/contracts";

import { rateLimitHandler } from "../middleware/rateLimiter.js";

// Password hashing constants
const BCRYPT_SALT_ROUNDS = 12;
// bcrypt truncates passwords at 72 bytes - enforce this limit
const MAX_PASSWORD_LENGTH = 72;

// Generate prefixed IDs
function generateId(prefix: string): string {
  return `${prefix}${nanoid(16)}`;
}

// Authentication decorator type
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const v1Routes: FastifyPluginAsync = async (app) => {
  // ============================================================================
  // Auth Routes
  // ============================================================================

  /** Register a new user */
  app.post<{ Body: { email: string; password: string; name?: string } }>(
    "/v1/auth/register",
    async (request, reply) => {
      const { email, password, name } = request.body;

      // Validate required fields
      if (!email || !password) {
        return reply.code(400).send({ error: "Email and password are required" });
      }

      // Check password strength and length
      if (password.length < 8) {
        return reply.code(400).send({ error: "Password must be at least 8 characters" });
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: "User already exists" });
      }

      // Hash password before storing
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      const user = await prisma.user.create({
        data: { email, name, passwordHash },
        select: { id: true, email: true, name: true, apiKey: true, plan: true, subscriptionStatus: true },
      });

      // Generate JWT token for the new user
      const token = generateToken(app, { id: user.id, email: user.email, name: user.name });

      reply.code(201).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: {
            plan: user.plan,
            status: user.subscriptionStatus,
          },
        },
        token,
      });
    }
  );

  /** Login with email and password */
  app.post<{ Body: { email: string; password: string } }>(
    "/v1/auth/login",
    { preHandler: [rateLimitHandler] },
    async (request, reply) => {
      const { email, password } = request.body;

      // Validate required fields
      if (!email || !password) {
        return reply.code(400).send({ error: "Email and password are required" });
      }

      // Validate password length (bcrypt truncates at 72 bytes)
      if (password.length > MAX_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: "Invalid email or password" });
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, passwordHash: true, plan: true, subscriptionStatus: true },
      });

      if (!user || !user.passwordHash) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      // Generate JWT token
      const token = generateToken(app, { id: user.id, email: user.email, name: user.name });

      reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: {
            plan: user.plan,
            status: user.subscriptionStatus,
          },
        },
        token,
      });
    }
  );

  /** Get current user info (requires auth) */
  app.get(
    "/v1/auth/me",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = request.userId!;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, plan: true, subscriptionStatus: true },
      });

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: {
            plan: user.plan,
            status: user.subscriptionStatus,
          },
        },
      });
    }
  );

  // ============================================================================
  // Project Routes
  // ============================================================================

  /** Create a new project */
  app.post<{ Body: { name: string; type?: string } }>(
    "/v1/projects",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { name, type } = parsed.data;
      const id = generateId("proj_");

      const project = await prisma.project.create({
        data: {
          id,
          name,
          type: type === "album" ? "ALBUM" : "SINGLE",
          userId: request.userId!,
        },
        include: { tracks: true },
      });

      reply.code(201).send({
        id: project.id,
        name: project.name,
        type: project.type.toLowerCase(),
        status: project.status.toLowerCase(),
        tracks: [],
        createdAt: project.createdAt,
      });
    }
  );

  /** List all projects for user */
  app.get(
    "/v1/projects",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projects = await prisma.project.findMany({
        where: { userId: request.userId },
        include: {
          tracks: {
            select: { id: true, name: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      reply.send({
        projects: projects.map((p: (typeof projects)[number]) => ({
          id: p.id,
          name: p.name,
          type: p.type.toLowerCase(),
          status: p.status.toLowerCase(),
          trackCount: p.tracks.length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      });
    }
  );

  /** Get a single project */
  app.get<{ Params: { projectId: string } }>(
    "/v1/projects/:projectId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
        include: {
          tracks: {
            include: {
              analysisReport: true,
              masters: { include: { qcReport: true } },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      reply.send({
        id: project.id,
        name: project.name,
        type: project.type.toLowerCase(),
        status: project.status.toLowerCase(),
        tracks: project.tracks.map((t: (typeof project.tracks)[number]) => ({
          id: t.id,
          name: t.name,
          status: t.status.toLowerCase(),
          orderIndex: t.orderIndex,
          hasAnalysis: !!t.analysisReport,
          hasMaster: t.masters.length > 0,
        })),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    }
  );

  // ============================================================================
  // Track Import Routes
  // ============================================================================

  /** Get pre-signed upload URL for a track */
  app.post<{ Params: { projectId: string }; Body: { name: string; contentType?: string } }>(
    "/v1/projects/:projectId/tracks/upload-url",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      const { name, contentType = "audio/wav" } = request.body;

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
      });
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const trackId = generateId("trk_");
      const key = generateKey(`tracks/${projectId}`, name);
      const uploadUrl = await getUploadUrl(BUCKETS.AUDIO, key, contentType, 3600);

      // Create track in pending state
      await prisma.track.create({
        data: {
          id: trackId,
          projectId,
          name,
          originalUrl: getInternalUrl(BUCKETS.AUDIO, key),
          status: "UPLOADED",
        },
      });

      reply.code(201).send({
        trackId,
        uploadUrl,
        key,
        expiresIn: 3600,
      });
    }
  );

  /** Import a track by URL (for remote files) */
  app.post<{ Params: { projectId: string }; Body: { name: string; sourceUrl?: string } }>(
    "/v1/projects/:projectId/tracks/import",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      const parsed = importTrackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { name, sourceUrl } = parsed.data;

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
      });
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const trackId = generateId("trk_");
      const trackCount = await prisma.track.count({ where: { projectId } });

      const track = await prisma.track.create({
        data: {
          id: trackId,
          projectId,
          name,
          originalUrl: sourceUrl || "",
          status: sourceUrl ? "UPLOADED" : "UPLOADED",
          orderIndex: trackCount,
        },
      });

      reply.code(201).send({
        id: track.id,
        name: track.name,
        projectId,
        status: track.status.toLowerCase(),
        originalUrl: track.originalUrl,
      });
    }
  );

  /** Get track details */
  app.get<{ Params: { trackId: string } }>(
    "/v1/tracks/:trackId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;

      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
        include: {
          analysisReport: true,
          masters: { include: { qcReport: true }, orderBy: { createdAt: "desc" } },
          codecPreviews: true,
          jobs: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });

      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      reply.send({
        id: track.id,
        name: track.name,
        status: track.status.toLowerCase(),
        originalUrl: track.originalUrl,
        fixedUrl: track.fixedUrl,
        analysis: track.analysisReport
          ? {
              integratedLufs: track.analysisReport.integratedLufs,
              loudnessRange: track.analysisReport.loudnessRange,
              truePeak: track.analysisReport.truePeak,
              samplePeak: track.analysisReport.samplePeak,
              hasClipping: track.analysisReport.hasClipping,
              hasDcOffset: track.analysisReport.hasDcOffset,
              durationSecs: track.analysisReport.durationSecs,
              sampleRate: track.analysisReport.sampleRate,
              channels: track.analysisReport.channels,
            }
          : null,
        masters: track.masters.map((m: (typeof track.masters)[number]) => ({
          id: m.id,
          profile: m.profile.toLowerCase(),
          loudnessTarget: m.loudnessTarget.toLowerCase(),
          wavHdUrl: m.wavHdUrl,
          wav16Url: m.wav16Url,
          mp3PreviewUrl: m.mp3PreviewUrl,
          finalLufs: m.finalLufs,
          finalTruePeak: m.finalTruePeak,
          passesQc: m.passesQc,
        })),
        codecPreviews: track.codecPreviews.map((c: (typeof track.codecPreviews)[number]) => ({
          id: c.id,
          codec: c.codec,
          previewUrl: c.previewUrl,
          artifactScore: c.artifactScore,
          clippingRisk: c.clippingRisk,
        })),
        recentJobs: track.jobs.map((j: (typeof track.jobs)[number]) => ({
          id: j.id,
          type: j.type.toLowerCase(),
          status: j.status.toLowerCase(),
          progress: j.progress,
          createdAt: j.createdAt,
        })),
      });
    }
  );

  // ============================================================================
  // Analysis Routes
  // ============================================================================

  /** Enqueue an analyze job for a track */
  app.post<{ Params: { trackId: string } }>(
    "/v1/tracks/:trackId/analyze",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;

      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
      });
      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      const jobId = generateId("job_");

      // Create job record
      await prisma.job.create({
        data: {
          id: jobId,
          trackId,
          type: "ANALYZE",
          status: "QUEUED",
          payload: { trackId, sourceUrl: track.originalUrl },
        },
      });

      // Update track status
      await prisma.track.update({
        where: { id: trackId },
        data: { status: "ANALYZING" },
      });

      // Enqueue job
      const job: AnalyzeJob = {
        type: "analyze",
        jobId,
        trackId,
        sourceUrl: track.originalUrl,
      };
      await enqueueJob(QUEUES.DSP_JOBS, job);

      reply.code(202).send({
        jobId,
        trackId,
        status: "queued",
      });
    }
  );

  // ============================================================================
  // Fix Routes
  // ============================================================================

  /** Enqueue a fix job for a track */
  app.post<{ Params: { trackId: string }; Body: { modules: string[] } }>(
    "/v1/tracks/:trackId/fix",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;
      const parsed = fixTrackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { modules } = parsed.data;

      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
      });
      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      const jobId = generateId("job_");

      // Create job record
      await prisma.job.create({
        data: {
          id: jobId,
          trackId,
          type: "FIX",
          status: "QUEUED",
          payload: { trackId, sourceUrl: track.originalUrl, modules },
        },
      });

      // Update track status
      await prisma.track.update({
        where: { id: trackId },
        data: { status: "FIXING" },
      });

      // Enqueue job
      const job: FixJob = {
        type: "fix",
        jobId,
        trackId,
        sourceUrl: track.originalUrl,
        modules,
      };
      await enqueueJob(QUEUES.DSP_JOBS, job);

      reply.code(202).send({
        jobId,
        trackId,
        modules,
        status: "queued",
      });
    }
  );

  // ============================================================================
  // Mastering Routes
  // ============================================================================

  /** Enqueue a master job for a track */
  app.post<{ Params: { trackId: string }; Body: { profile: string; loudnessTarget: string } }>(
    "/v1/tracks/:trackId/master",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;
      const parsed = masterTrackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { profile, loudnessTarget } = parsed.data;

      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
      });
      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      // Use fixed URL if available, otherwise original
      const sourceUrl = track.fixedUrl || track.originalUrl;
      const jobId = generateId("job_");

      // Create job record
      await prisma.job.create({
        data: {
          id: jobId,
          trackId,
          type: "MASTER",
          status: "QUEUED",
          payload: { trackId, sourceUrl, profile, loudnessTarget },
        },
      });

      // Update track status
      await prisma.track.update({
        where: { id: trackId },
        data: { status: "MASTERING" },
      });

      // Enqueue job
      const job: MasterJob = {
        type: "master",
        jobId,
        trackId,
        sourceUrl,
        profile,
        loudnessTarget,
      };
      await enqueueJob(QUEUES.DSP_JOBS, job);

      reply.code(202).send({
        jobId,
        trackId,
        profile,
        loudnessTarget,
        status: "queued",
      });
    }
  );

  // ============================================================================
  // Codec Preview Routes
  // ============================================================================

  /** Enqueue a codec preview job for a track */
  app.post<{ Params: { trackId: string }; Body: { codecs: string[] } }>(
    "/v1/tracks/:trackId/codec-preview",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;
      const parsed = codecPreviewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { codecs } = parsed.data;

      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
        include: {
          masters: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      const latestMaster = track.masters[0];
      if (!latestMaster?.wavHdUrl) {
        return reply.code(400).send({ error: "Track must be mastered before codec preview" });
      }

      const jobId = generateId("job_");

      // Create job record
      await prisma.job.create({
        data: {
          id: jobId,
          trackId,
          type: "CODEC_PREVIEW",
          status: "QUEUED",
          payload: { trackId, masterUrl: latestMaster.wavHdUrl, codecs },
        },
      });

      // Enqueue job
      const job: CodecPreviewJob = {
        type: "codec-preview",
        jobId,
        trackId,
        masterUrl: latestMaster.wavHdUrl,
        codecs,
      };
      await enqueueJob(QUEUES.CODEC_JOBS, job);

      reply.code(202).send({
        jobId,
        trackId,
        codecs,
        status: "queued",
      });
    }
  );

  // ============================================================================
  // Album Master Routes
  // ============================================================================

  /** Enqueue an album master job */
  app.post<{
    Params: { projectId: string };
    Body: { trackIds?: string[]; profile: string; loudnessTarget: string; normalizeLoudness?: boolean };
  }>(
    "/v1/projects/:projectId/album-master",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      const parsed = albumMasterSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { profile, loudnessTarget, normalizeLoudness = true } = parsed.data;

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
        include: {
          tracks: { orderBy: { orderIndex: "asc" } },
        },
      });
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      if (project.tracks.length === 0) {
        return reply.code(400).send({ error: "Project has no tracks" });
      }

      // Use provided order or default order
      const trackIds = parsed.data.trackIds || project.tracks.map((t: (typeof project.tracks)[number]) => t.id);
      const jobId = generateId("job_");

      // Create job record
      await prisma.job.create({
        data: {
          id: jobId,
          projectId,
          type: "ALBUM_MASTER",
          status: "QUEUED",
          payload: { projectId, trackIds, profile, loudnessTarget, normalizeLoudness },
        },
      });

      // Update project status
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "MASTERING" },
      });

      // Enqueue job
      const job: AlbumMasterJob = {
        type: "album-master",
        jobId,
        projectId,
        trackIds,
        profile,
        loudnessTarget,
        normalizeLoudness,
      };
      await enqueueJob(QUEUES.DSP_JOBS, job);

      reply.code(202).send({
        jobId,
        projectId,
        trackIds,
        profile,
        loudnessTarget,
        status: "queued",
      });
    }
  );

  // ============================================================================
  // Export Routes
  // ============================================================================

  /** Export a project */
  app.post<{ Params: { projectId: string }; Body: { formats: string[]; includeQc?: boolean } }>(
    "/v1/projects/:projectId/export",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      const parsed = exportProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Validation failed", details: parsed.error.issues });
      }

      const { formats, includeQc = true } = parsed.data;

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
        include: {
          tracks: {
            include: { masters: { take: 1, orderBy: { createdAt: "desc" } } },
          },
        },
      });
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      // Verify all tracks are mastered
      const unmasteredTracks = project.tracks.filter((t: (typeof project.tracks)[number]) => t.masters.length === 0);
      if (unmasteredTracks.length > 0) {
        return reply.code(400).send({
          error: "All tracks must be mastered before export",
          unmasteredTracks: unmasteredTracks.map((t: (typeof unmasteredTracks)[number]) => t.id),
        });
      }

      const jobId = generateId("job_");
      const exportId = generateId("exp_");

      // Create export record
      await prisma.export.create({
        data: {
          id: exportId,
          projectId,
          formats,
          includeQc,
          status: "PENDING",
        },
      });

      // Create job record
      await prisma.job.create({
        data: {
          id: jobId,
          projectId,
          type: "EXPORT",
          status: "QUEUED",
          payload: { projectId, formats, includeQc },
        },
      });

      // Update project status
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "EXPORTING" },
      });

      // Enqueue job
      const job: ExportJob = {
        type: "export",
        jobId,
        projectId,
        formats,
        includeQc,
      };
      await enqueueJob(QUEUES.DSP_JOBS, job);

      reply.code(202).send({
        jobId,
        exportId,
        projectId,
        formats,
        status: "queued",
      });
    }
  );

  /** Get export status */
  app.get<{ Params: { projectId: string } }>(
    "/v1/projects/:projectId/exports",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;

      const exports = await prisma.export.findMany({
        where: {
          projectId,
          project: { userId: request.userId },
        },
        orderBy: { createdAt: "desc" },
      });

      reply.send({
        exports: exports.map((e: (typeof exports)[number]) => ({
          id: e.id,
          formats: e.formats,
          includeQc: e.includeQc,
          packUrl: e.packUrl,
          status: e.status.toLowerCase(),
          createdAt: e.createdAt,
          completedAt: e.completedAt,
        })),
      });
    }
  );

  // ============================================================================
  // Job Status Routes
  // ============================================================================

  /** Get job status */
  app.get<{ Params: { jobId: string } }>(
    "/v1/jobs/:jobId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { jobId } = request.params;

      const job = await prisma.job.findFirst({
        where: {
          id: jobId,
          OR: [
            { track: { project: { userId: request.userId } } },
            { projectId: { not: null } },
          ],
        },
        include: {
          track: { select: { id: true, name: true } },
        },
      });

      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }

      reply.send({
        id: job.id,
        type: job.type.toLowerCase().replace("_", "-"),
        status: job.status.toLowerCase(),
        progress: job.progress,
        message: job.message,
        trackId: job.trackId,
        trackName: job.track?.name,
        resultUrl: job.resultUrl,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      });
    }
  );

  /** List recent jobs */
  app.get(
    "/v1/jobs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const jobs = await prisma.job.findMany({
        where: {
          OR: [
            { track: { project: { userId: request.userId } } },
            { projectId: { not: null } },
          ],
        },
        include: {
          track: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      reply.send({
        jobs: jobs.map((j: (typeof jobs)[number]) => ({
          id: j.id,
          type: j.type.toLowerCase().replace("_", "-"),
          status: j.status.toLowerCase(),
          progress: j.progress,
          trackId: j.trackId,
          trackName: j.track?.name,
          createdAt: j.createdAt,
        })),
      });
    }
  );

  // ============================================================================
  // Reports Routes
  // ============================================================================

  /** Get analysis and QC reports for a track */
  app.get<{ Params: { trackId: string } }>(
    "/v1/tracks/:trackId/reports",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;

      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
        include: {
          analysisReport: true,
          masters: {
            include: { qcReport: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      const reports: object[] = [];

      if (track.analysisReport) {
        reports.push({
          type: "analysis",
          data: {
            integratedLufs: track.analysisReport.integratedLufs,
            loudnessRange: track.analysisReport.loudnessRange,
            shortTermMax: track.analysisReport.shortTermMax,
            momentaryMax: track.analysisReport.momentaryMax,
            samplePeak: track.analysisReport.samplePeak,
            truePeak: track.analysisReport.truePeak,
            spectralCentroid: track.analysisReport.spectralCentroid,
            stereoCorrelation: track.analysisReport.stereoCorrelation,
            hasClipping: track.analysisReport.hasClipping,
            hasDcOffset: track.analysisReport.hasDcOffset,
            clippedSamples: track.analysisReport.clippedSamples,
            sampleRate: track.analysisReport.sampleRate,
            bitDepth: track.analysisReport.bitDepth,
            channels: track.analysisReport.channels,
            durationSecs: track.analysisReport.durationSecs,
          },
          reportUrl: track.analysisReport.reportUrl,
          createdAt: track.analysisReport.createdAt,
        });
      }

      for (const master of track.masters) {
        if (master.qcReport) {
          reports.push({
            type: "qc",
            masterId: master.id,
            profile: master.profile.toLowerCase(),
            data: {
              truePeakPasses: master.qcReport.truePeakPasses,
              truePeakValue: master.qcReport.truePeakValue,
              loudnessPasses: master.qcReport.loudnessPasses,
              loudnessValue: master.qcReport.loudnessValue,
              lowFreqBalance: master.qcReport.lowFreqBalance,
              midFreqBalance: master.qcReport.midFreqBalance,
              highFreqBalance: master.qcReport.highFreqBalance,
              tonalWarnings: master.qcReport.tonalWarnings,
              overallPass: master.qcReport.overallPass,
              failureReasons: master.qcReport.failureReasons,
            },
            reportUrl: master.qcReport.reportUrl,
            createdAt: master.qcReport.createdAt,
          });
        }
      }

      reply.send({ trackId, reports });
    }
  );

  // ============================================================================
  // Download URLs
  // ============================================================================

  /** Get download URL for a mastered file */
  app.get<{ Params: { trackId: string; masterId: string }; Querystring: { format?: string } }>(
    "/v1/tracks/:trackId/masters/:masterId/download",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId, masterId } = request.params;
      const format = (request.query as { format?: string }).format || "wav-24";

      const master = await prisma.master.findFirst({
        where: {
          id: masterId,
          trackId,
          track: { project: { userId: request.userId } },
        },
      });

      if (!master) {
        return reply.code(404).send({ error: "Master not found" });
      }

      let fileUrl: string | null = null;
      switch (format) {
        case "wav-24":
          fileUrl = master.wavHdUrl;
          break;
        case "wav-16":
          fileUrl = master.wav16Url;
          break;
        case "mp3-320":
          fileUrl = master.mp3PreviewUrl;
          break;
      }

      if (!fileUrl) {
        return reply.code(404).send({ error: `Format ${format} not available` });
      }

      // Extract key from URL and generate signed download URL
      const key = fileUrl.split("/").slice(-2).join("/");
      const downloadUrl = await getDownloadUrl(BUCKETS.AUDIO, key, 3600);

      reply.send({ downloadUrl, format, expiresIn: 3600 });
    }
  );

  // ============================================================================
  // Track Export (Release-Ready) Routes
  // ============================================================================

  /**
   * Create a Release-Ready export job for a track
   *
   * Features:
   * - Default 24-bit WAV output (distribution safe)
   * - Selectable bit depth: 16 (with dither), 24 (default), 32f
   * - True peak ceiling enforcement (default -2.0 dBTP)
   * - Automatic gain reduction to meet ceiling
   * - Optional MP3 and AAC outputs
   */
  app.post<{
    Params: { trackId: string };
    Body: {
      bitDepth?: string;
      sampleRate?: number;
      truePeakCeilingDb?: number;
      includeMp3?: boolean;
      includeAac?: boolean;
    };
  }>(
    "/v1/tracks/:trackId/exports",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;

      // Validate request body with defaults
      const parsed = trackExportSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parsed.error.issues,
        });
      }

      const { bitDepth, sampleRate, truePeakCeilingDb, includeMp3, includeAac } = parsed.data;

      // Verify track exists and belongs to user
      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
        include: {
          masters: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      // Determine source file (prefer latest master, then fixed, then original)
      const latestMaster = track.masters[0];
      let sourceUrl = track.originalUrl;
      if (latestMaster?.wavHdUrl) {
        sourceUrl = latestMaster.wavHdUrl;
      } else if (track.fixedUrl) {
        sourceUrl = track.fixedUrl;
      }

      // Map bit depth string to enum
      const bitDepthEnum = bitDepth === "16" ? "BD_16" : bitDepth === "32f" ? "BD_32F" : "BD_24";

      // Create export job record
      const exportJob = await prisma.exportJob.create({
        data: {
          trackId,
          status: "QUEUED",
          bitDepth: bitDepthEnum,
          sampleRate,
          truePeakCeilingDb,
          includeMp3,
          includeAac,
        },
      });

      // Create job record for tracking
      const jobId = generateId("job_");
      await prisma.job.create({
        data: {
          id: jobId,
          trackId,
          type: "EXPORT",
          status: "QUEUED",
          payload: {
            exportJobId: exportJob.id,
            trackId,
            sourceUrl,
            bitDepth,
            sampleRate,
            truePeakCeilingDb,
            includeMp3,
            includeAac,
          },
        },
      });

      // Enqueue for worker processing
      await enqueueJob(QUEUES.DSP_JOBS, {
        type: "track-export",
        jobId,
        exportJobId: exportJob.id,
        trackId,
        sourceUrl,
        bitDepth,
        sampleRate,
        truePeakCeilingDb,
        includeMp3,
        includeAac,
      });

      reply.code(202).send({
        jobId: exportJob.id,
        trackId,
        status: "queued",
        settings: {
          bitDepth,
          sampleRate,
          truePeakCeilingDb,
          includeMp3,
          includeAac,
        },
      });
    }
  );

  /** Get export job status and results */
  app.get<{ Params: { exportJobId: string } }>(
    "/v1/exports/:exportJobId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { exportJobId } = request.params;

      const exportJob = await prisma.exportJob.findFirst({
        where: {
          id: exportJobId,
          track: { project: { userId: request.userId } },
        },
        include: {
          track: { select: { id: true, name: true } },
        },
      });

      if (!exportJob) {
        return reply.code(404).send({ error: "Export job not found" });
      }

      // Map status to lowercase
      const status = exportJob.status.toLowerCase();

      reply.send({
        id: exportJob.id,
        trackId: exportJob.trackId,
        trackName: exportJob.track.name,
        status,
        settings: {
          bitDepth: exportJob.bitDepth.replace("BD_", "").toLowerCase().replace("f", "f"),
          sampleRate: exportJob.sampleRate,
          truePeakCeilingDb: exportJob.truePeakCeilingDb,
          includeMp3: exportJob.includeMp3,
          includeAac: exportJob.includeAac,
        },
        results:
          status === "succeeded"
            ? {
                outputWavUrl: exportJob.outputWavUrl,
                outputMp3Url: exportJob.outputMp3Url,
                outputAacUrl: exportJob.outputAacUrl,
                qcJsonUrl: exportJob.qcJsonUrl,
                finalGainDb: exportJob.finalGainDb,
                finalTruePeakDbfs: exportJob.finalTruePeakDbfs,
                finalIntegratedLufs: exportJob.finalIntegratedLufs,
                finalLra: exportJob.finalLra,
                releaseReadyPasses: exportJob.releaseReadyPasses,
                attempts: exportJob.attempts,
              }
            : null,
        error: exportJob.errorMessage,
        createdAt: exportJob.createdAt,
        completedAt: exportJob.completedAt,
      });
    }
  );

  /** List export jobs for a track */
  app.get<{ Params: { trackId: string } }>(
    "/v1/tracks/:trackId/exports",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { trackId } = request.params;

      // Verify track belongs to user
      const track = await prisma.track.findFirst({
        where: {
          id: trackId,
          project: { userId: request.userId },
        },
      });

      if (!track) {
        return reply.code(404).send({ error: "Track not found" });
      }

      const exportJobs = await prisma.exportJob.findMany({
        where: { trackId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      reply.send({
        exports: exportJobs.map((e: (typeof exportJobs)[number]) => ({
          id: e.id,
          status: e.status.toLowerCase(),
          bitDepth: e.bitDepth.replace("BD_", "").toLowerCase().replace("f", "f"),
          sampleRate: e.sampleRate,
          truePeakCeilingDb: e.truePeakCeilingDb,
          releaseReadyPasses: e.releaseReadyPasses,
          finalTruePeakDbfs: e.finalTruePeakDbfs,
          createdAt: e.createdAt,
          completedAt: e.completedAt,
        })),
      });
    }
  );
};

export default v1Routes;
