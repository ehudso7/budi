// Budi API Server - Standalone server mode
import { buildApp } from "./app.js";

const app = await buildApp();

// Graceful shutdown
const signals = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    const { prisma } = await import("./lib/db.js");
    await prisma.$disconnect();
    process.exit(0);
  });
}

// Start server
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`Budi API listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
