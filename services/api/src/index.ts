import Fastify from "fastify";
import jobsRoutes from "./routes/jobs.js";

const app = Fastify({ logger: true });

// Register application routes
app.register(jobsRoutes);

app.get("/health", async () => {
  return {
    ok: true,
    service: "masterforge-api",
    time: new Date().toISOString(),
  };
});

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});