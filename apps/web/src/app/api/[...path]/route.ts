// Next.js App Router API Route - Wraps Fastify API
import { NextRequest, NextResponse } from "next/server";

// Dynamic import to avoid build-time issues
let appPromise: Promise<any> | null = null;
let app: any = null;

async function getApp() {
  if (!app) {
    if (!appPromise) {
      appPromise = (async () => {
        try {
          // Import the built Fastify app
          const { buildApp } = await import("@budi/api");
          const instance = await buildApp();
          await instance.ready();
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
    const apiPath = url.pathname;

    // Convert headers to a plain object
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get the request body for non-GET requests
    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.text();
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
          value.forEach((v) => responseHeaders.append(key, v));
        } else {
          responseHeaders.set(key, value);
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

// Disable body parsing to handle raw bodies (needed for webhooks)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
