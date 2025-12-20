import { FastifyPluginAsync } from "fastify";
import Redis from "ioredis";
import {
  AnalyzeJob,
  FixJob,
  MasterJob,
  CodecPreviewJob,
  Job,
} from "@masterforge/contracts";

// Initialize Redis connection. In production you would use a connection pool.
const redis = new Redis(
  Number(process.env.REDIS_PORT ?? 6379),
  process.env.REDIS_HOST ?? "localhost"
);

const jobsRoutes: FastifyPluginAsync = async (app) => {
  // Helper to push a job to the Redis list
  async function enqueue(job: Job) {
    await redis.lpush("jobs", JSON.stringify(job));
  }

  app.post<{ Body: AnalyzeJob }>("/jobs/analyze", async (request, reply) => {
    const { trackId, sourceUrl } = request.body;
    await enqueue({ type: "analyze", trackId, sourceUrl });
    reply.code(202).send({ enqueued: true });
  });

  app.post<{ Body: FixJob }>("/jobs/fix", async (request, reply) => {
    const { trackId, sourceUrl, modules } = request.body;
    await enqueue({ type: "fix", trackId, sourceUrl, modules });
    reply.code(202).send({ enqueued: true });
  });

  app.post<{ Body: MasterJob }>("/jobs/master", async (request, reply) => {
    const { trackId, sourceUrl, profile } = request.body;
    await enqueue({ type: "master", trackId, sourceUrl, profile });
    reply.code(202).send({ enqueued: true });
  });

  app.post<{ Body: CodecPreviewJob }>("/jobs/codec-preview", async (request, reply) => {
    const { trackId, masterUrl, codecs } = request.body;
    await enqueue({ type: "codec-preview", trackId, masterUrl, codecs });
    reply.code(202).send({ enqueued: true });
  });
};

export default jobsRoutes;