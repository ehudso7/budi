// GDPR compliance routes
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { exportUserData, deleteUserData, getUserConsent } from "../lib/gdpr.js";

const gdprRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Export user data (GDPR Article 20 - Data Portability)
   */
  app.get(
    "/api/v1/me/data-export",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId!;

      try {
        const data = await exportUserData(userId, request);

        // Return as downloadable JSON
        reply.header("Content-Type", "application/json");
        reply.header(
          "Content-Disposition",
          `attachment; filename="budi-data-export-${new Date().toISOString().split("T")[0]}.json"`
        );

        return data;
      } catch (error) {
        request.log.error(error, "Failed to export user data");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to export user data",
        });
      }
    }
  );

  /**
   * Delete user account and all data (GDPR Article 17 - Right to Erasure)
   */
  app.delete(
    "/api/v1/me/account",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId!;

      try {
        const result = await deleteUserData(userId, request);

        return {
          success: true,
          message: "Account and all associated data have been deleted",
          deleted: result.deleted,
        };
      } catch (error) {
        request.log.error(error, "Failed to delete user account");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to delete account",
        });
      }
    }
  );

  /**
   * Get consent status
   */
  app.get(
    "/api/v1/me/consent",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.userId!;

      const consent = await getUserConsent(userId);
      return consent;
    }
  );

  /**
   * Privacy policy acknowledgment
   */
  app.get("/api/v1/privacy", async () => {
    return {
      version: "1.0.0",
      lastUpdated: "2024-01-01",
      dataController: {
        name: "Budi Audio",
        email: "privacy@budi.audio",
      },
      dataProcessing: [
        {
          purpose: "Audio Processing",
          description: "Processing and mastering of uploaded audio files",
          legalBasis: "Contract performance",
          retention: "Until account deletion or 2 years of inactivity",
        },
        {
          purpose: "Account Management",
          description: "Managing user accounts and preferences",
          legalBasis: "Contract performance",
          retention: "Until account deletion",
        },
        {
          purpose: "Payment Processing",
          description: "Processing subscription payments via Stripe",
          legalBasis: "Contract performance",
          retention: "As required by financial regulations",
        },
        {
          purpose: "Analytics",
          description: "Aggregated usage analytics for service improvement",
          legalBasis: "Legitimate interest",
          retention: "Anonymized after 1 year",
        },
      ],
      rights: [
        "Right to access your data (GET /api/v1/me/data-export)",
        "Right to rectification (contact support)",
        "Right to erasure (DELETE /api/v1/me/account)",
        "Right to data portability (GET /api/v1/me/data-export)",
        "Right to object (contact support)",
      ],
      contact: {
        dpo: "dpo@budi.audio",
        support: "support@budi.audio",
      },
    };
  });

  /**
   * Cookie consent information
   */
  app.get("/api/v1/cookies", async () => {
    return {
      cookies: [
        {
          name: "session",
          purpose: "Authentication session",
          category: "essential",
          expiry: "7 days",
        },
        {
          name: "preferences",
          purpose: "User preferences",
          category: "functional",
          expiry: "1 year",
        },
      ],
      analytics: {
        provider: "Self-hosted",
        anonymized: true,
        optOut: "Contact support to opt out of analytics",
      },
    };
  });
};

export default gdprRoutes;
