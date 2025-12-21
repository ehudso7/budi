// OpenAPI/Swagger documentation setup
import type { FastifyInstance } from "fastify";

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/swagger"), {
    openapi: {
      info: {
        title: "Budi API",
        description: "Audio mastering and QC platform API",
        version: "1.0.0",
        contact: {
          name: "Budi Support",
          email: "support@budi.audio",
        },
        license: {
          name: "MIT",
        },
      },
      servers: [
        {
          url: process.env.API_URL || "http://localhost:3000",
          description: process.env.NODE_ENV === "production" ? "Production" : "Development",
        },
      ],
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "projects", description: "Project management" },
        { name: "tracks", description: "Track processing" },
        { name: "billing", description: "Subscription and billing" },
        { name: "iap", description: "iOS In-App Purchase" },
        { name: "notifications", description: "Push notifications" },
        { name: "gdpr", description: "GDPR compliance" },
        { name: "admin", description: "Admin endpoints" },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: "x-api-key",
            in: "header",
            description: "API key for authentication",
          },
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT token from login",
          },
        },
        schemas: {
          Error: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              statusCode: { type: "number" },
            },
            required: ["error", "message"],
          },
          Project: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: ["SINGLE", "ALBUM"] },
              status: {
                type: "string",
                enum: [
                  "CREATED",
                  "ANALYZING",
                  "ANALYZED",
                  "MASTERING",
                  "MASTERED",
                  "EXPORTING",
                  "EXPORTED",
                  "FAILED",
                ],
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
          Track: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              status: {
                type: "string",
                enum: [
                  "UPLOADED",
                  "ANALYZING",
                  "ANALYZED",
                  "FIXING",
                  "FIXED",
                  "MASTERING",
                  "MASTERED",
                  "FAILED",
                ],
              },
              originalUrl: { type: "string" },
              fixedUrl: { type: "string", nullable: true },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          AnalysisReport: {
            type: "object",
            properties: {
              integratedLufs: { type: "number", description: "Integrated loudness in LUFS" },
              loudnessRange: { type: "number", description: "Loudness range in LU" },
              truePeak: { type: "number", description: "True peak in dBTP" },
              hasClipping: { type: "boolean" },
              hasDcOffset: { type: "boolean" },
              sampleRate: { type: "integer" },
              bitDepth: { type: "integer" },
              channels: { type: "integer" },
              durationSecs: { type: "number" },
            },
          },
          Subscription: {
            type: "object",
            properties: {
              plan: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] },
              status: {
                type: "string",
                enum: ["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "UNPAID"],
              },
              trialEndsAt: { type: "string", format: "date-time", nullable: true },
              currentPeriodEnd: { type: "string", format: "date-time", nullable: true },
            },
          },
          Plan: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              price: {
                type: "object",
                properties: {
                  monthly: { type: "number" },
                  yearly: { type: "number" },
                },
              },
              features: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
      security: [{ apiKey: [] }, { bearerAuth: [] }],
    },
  });

  await app.register(import("@fastify/swagger-ui"), {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
      persistAuthorization: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}

// Route schemas for documentation
export const routeSchemas = {
  // Auth routes
  login: {
    tags: ["auth"],
    summary: "User login",
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 8 },
      },
      required: ["email", "password"],
    },
    response: {
      200: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              email: { type: "string" },
              name: { type: "string" },
            },
          },
        },
      },
    },
  },

  // Project routes
  createProject: {
    tags: ["projects"],
    summary: "Create a new project",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    body: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 255 },
        type: { type: "string", enum: ["SINGLE", "ALBUM"], default: "SINGLE" },
      },
      required: ["name"],
    },
    response: {
      201: { $ref: "#/components/schemas/Project" },
    },
  },

  getProject: {
    tags: ["projects"],
    summary: "Get a project by ID",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    params: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
    response: {
      200: { $ref: "#/components/schemas/Project" },
      404: { $ref: "#/components/schemas/Error" },
    },
  },

  // Track routes
  uploadTrack: {
    tags: ["tracks"],
    summary: "Upload a track to a project",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    consumes: ["multipart/form-data"],
    params: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
      required: ["projectId"],
    },
    response: {
      201: { $ref: "#/components/schemas/Track" },
    },
  },

  analyzeTrack: {
    tags: ["tracks"],
    summary: "Start analysis of a track",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    params: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
    response: {
      202: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          status: { type: "string" },
        },
      },
    },
  },

  // Billing routes
  getPlans: {
    tags: ["billing"],
    summary: "Get available subscription plans",
    response: {
      200: {
        type: "object",
        properties: {
          plans: {
            type: "array",
            items: { $ref: "#/components/schemas/Plan" },
          },
        },
      },
    },
  },

  createCheckout: {
    tags: ["billing"],
    summary: "Create a checkout session",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    body: {
      type: "object",
      properties: {
        priceId: { type: "string" },
        successUrl: { type: "string", format: "uri" },
        cancelUrl: { type: "string", format: "uri" },
      },
      required: ["priceId", "successUrl", "cancelUrl"],
    },
    response: {
      200: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
        },
      },
    },
  },

  // GDPR routes
  exportData: {
    tags: ["gdpr"],
    summary: "Export all user data",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    response: {
      200: {
        type: "object",
        description: "User data export in JSON format",
      },
    },
  },

  deleteAccount: {
    tags: ["gdpr"],
    summary: "Delete user account and all data",
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    response: {
      200: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
        },
      },
    },
  },
};
