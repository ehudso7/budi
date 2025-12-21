// Vercel Serverless Handler for Budi API
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildApp } from "../services/api/dist/app.js";

// Cache the app instance and initialization promise to prevent race conditions
let app: Awaited<ReturnType<typeof buildApp>> | null = null;
let appPromise: Promise<Awaited<ReturnType<typeof buildApp>>> | null = null;

async function getApp() {
  if (!app) {
    if (!appPromise) {
      appPromise = (async () => {
        const instance = await buildApp();
        await instance.ready();
        return instance;
      })();
    }
    app = await appPromise;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fastify = await getApp();

    // Use Fastify's inject to handle the request
    const response = await fastify.inject({
      method: req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS",
      url: req.url || "/",
      headers: req.headers as Record<string, string>,
      payload: req.body,
    });

    // Set response headers (handle both string and array values)
    const headers = response.headers;
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        res.setHeader(key, value as string | string[]);
      }
    }

    // Send response
    res.status(response.statusCode).send(response.payload);
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  }
}
