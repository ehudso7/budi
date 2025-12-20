import { FastifyPluginAsync } from "fastify";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import {
  FixJob,
  MasterJob,
  CodecPreviewJob,
  Job,
  LoudnessTarget,
} from "@budi/contracts";

// Initialize Redis connection. In production you would use a connection pool.
const redis = new Redis(
  Number(process.env.REDIS_PORT ?? 6379),
  process.env.REDIS_HOST ?? "localhost"
);

// Request bodies (without jobId - server generates it)
interface AnalyzeRequest { trackId: string; sourceUrl: string; }
interface FixRequest { trackId: string; sourceUrl: string; modules: FixJob["modules"]; }
interface MasterRequest { trackId: string; sourceUrl: string; profile: MasterJob["profile"]; loudnessTarget?: LoudnessTarget; }
interface CodecPreviewRequest { trackId: string; masterUrl: string; codecs: CodecPreviewJob["codecs"]; }

const jobsRoutes: FastifyPluginAsync = async (app) => {
  // Helper to push a job to the Redis list
  async function enqueue(job: Job) {
    await redis.lpush("jobs", JSON.stringify(job));
  }

  app.post<{ Body: AnalyzeRequest }>("/jobs/analyze", async (request, reply) => {
    const { trackId, sourceUrl } = request.body;
    const jobId = randomUUID();
    await enqueue({ type: "analyze", jobId, trackId, sourceUrl });
    reply.code(202).send({ enqueued: true, jobId });
  });

  app.post<{ Body: FixRequest }>("/jobs/fix", async (request, reply) => {
    const { trackId, sourceUrl, modules } = request.body;
    const jobId = randomUUID();
    await enqueue({ type: "fix", jobId, trackId, sourceUrl, modules });
    reply.code(202).send({ enqueued: true, jobId });
  });

  app.post<{ Body: MasterRequest }>("/jobs/master", async (request, reply) => {
    const { trackId, sourceUrl, profile, loudnessTarget = "medium" } = request.body;
    const jobId = randomUUID();
    await enqueue({ type: "master", jobId, trackId, sourceUrl, profile, loudnessTarget });
    reply.code(202).send({ enqueued: true, jobId });
  });

  app.post<{ Body: CodecPreviewRequest }>("/jobs/codec-preview", async (request, reply) => {
    const { trackId, masterUrl, codecs } = request.body;
    const jobId = randomUUID();
    await enqueue({ type: "codec-preview", jobId, trackId, masterUrl, codecs });
    reply.code(202).send({ enqueued: true, jobId });
  });
};

export default jobsRoutes;