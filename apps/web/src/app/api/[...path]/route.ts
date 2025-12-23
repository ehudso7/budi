// Next.js App Router API Route - Wraps Fastify API
import { NextRequest, NextResponse } from "next/server";
import type { FastifyInstance } from "fastify";

// Dynamic import to avoid build-time issues
let appPromise: Promise<FastifyInstance> | null = null;
let app: FastifyInstance | null = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    if (!appPromise) {
      if (initAttempts >= MAX_INIT_ATTEMPTS) {
        throw new Error(`Failed to initialize app after ${MAX_INIT_ATTEMPTS} attempts`);
      }
      initAttempts++;
      appPromise = (async () => {
        try {
          // Import the built Fastify app
          const { buildApp } = await import("@budi/api");
          const instance = await buildApp();
          await instance.ready();
          initAttempts = 0; // Reset on success
          return instance;
        } catch (error) {
          appPromise = null;
          throw error;
        }
      })();
    }
    app = await appPromise;
  }
  return app;
}

async function handler(req: NextRequest) {
  try {
    const fastify = await getApp();

    // Get the path from the URL
    const url = new URL(req.url);
    // Strip the /api prefix since Fastify routes don't include it
    // Frontend calls /api/v1/... but Fastify routes are at /v1/...
    const apiPath = url.pathname.replace(/^\/api/, "");

    // Convert headers to a plain object
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get the request body for non-GET requests
    // Use Buffer to preserve raw bytes for webhook signature verification
    let body: Buffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const arrayBuffer = await req.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    }

    // Use Fastify's inject to handle the request
    const response = await fastify.inject({
      method: req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS",
      url: apiPath + url.search,
      headers,
      payload: body,
    });

    // Build response headers
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => responseHeaders.append(key, String(v)));
        } else {
          responseHeaders.set(key, String(value));
        }
      }
    }

    return new NextResponse(response.payload, {
      status: response.statusCode,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("API handler error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;
export const OPTIONS = handler;

// Use Node.js runtime and force dynamic rendering for API routes
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
