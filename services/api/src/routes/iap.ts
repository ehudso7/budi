// In-App Purchase routes for iOS StoreKit 2
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  verifyPurchase,
  restorePurchases,
  handleServerNotification,
} from "../lib/storekit.js";
import prisma from "../lib/db.js";

const iapRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Verify a purchase from the iOS app
   */
  app.post<{
    Body: {
      signedTransaction: string;
    };
  }>(
    "/api/v1/iap/verify",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = request.userId!;
      const { signedTransaction } = request.body;

      if (!signedTransaction) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "signedTransaction is required",
        });
      }

      try {
        const result = await verifyPurchase(userId, signedTransaction);

        if (!result.valid) {
          return reply.code(400).send({
            error: "Invalid Purchase",
            message: "The purchase could not be verified",
          });
        }

        return {
          success: true,
          plan: result.plan,
          expiresAt: result.expiresAt?.toISOString(),
          transactionId: result.transactionId,
        };
      } catch (error) {
        request.log.error(error, "Failed to verify purchase");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to verify purchase",
        });
      }
    }
  );

  /**
   * Restore purchases for the current user
   */
  app.post<{
    Body: {
      signedTransactions: string[];
    };
  }>(
    "/api/v1/iap/restore",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = request.userId!;
      const { signedTransactions } = request.body;

      if (!signedTransactions || !Array.isArray(signedTransactions)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "signedTransactions array is required",
        });
      }

      try {
        const result = await restorePurchases(userId, signedTransactions);

        return {
          success: true,
          restored: result.restored,
          plan: result.plan,
          expiresAt: result.expiresAt?.toISOString(),
        };
      } catch (error) {
        request.log.error(error, "Failed to restore purchases");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to restore purchases",
        });
      }
    }
  );

  /**
   * Get current subscription status
   */
  app.get(
    "/api/v1/iap/subscription",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.userId!;

      // Get user's subscription info from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          plan: true,
          subscriptionStatus: true,
          subscriptionId: true,
          currentPeriodEnd: true,
        },
      });

      if (!user) {
        return {
          plan: "FREE",
          status: "NONE",
          expiresAt: null,
          source: null,
        };
      }

      const source = user.subscriptionId?.startsWith("apple:")
        ? "apple"
        : user.subscriptionId?.startsWith("sub_")
          ? "stripe"
          : null;

      return {
        plan: user.plan,
        status: user.subscriptionStatus,
        expiresAt: user.currentPeriodEnd?.toISOString() || null,
        source,
      };
    }
  );

  /**
   * App Store Server Notification V2 webhook
   * Apple sends notifications about subscription changes here
   */
  app.post<{
    Body: {
      signedPayload: string;
    };
  }>("/api/v1/iap/webhook", async (request, reply) => {
    const { signedPayload } = request.body;

    if (!signedPayload) {
      return reply.code(400).send({ error: "Missing signedPayload" });
    }

    try {
      await handleServerNotification(signedPayload);
      return { success: true };
    } catch (error) {
      request.log.error(error, "Failed to process App Store notification");
      return reply.code(500).send({ error: "Failed to process notification" });
    }
  });

  /**
   * Get available products (for iOS app to display)
   */
  app.get("/api/v1/iap/products", async () => {
    return {
      products: [
        {
          id: "com.budi.pro.monthly",
          plan: "PRO",
          period: "monthly",
          features: [
            "25 projects",
            "100 tracks/month",
            "50 GB storage",
            "Priority queue",
            "HD exports",
          ],
        },
        {
          id: "com.budi.pro.yearly",
          plan: "PRO",
          period: "yearly",
          features: [
            "25 projects",
            "100 tracks/month",
            "50 GB storage",
            "Priority queue",
            "HD exports",
            "2 months free",
          ],
          popular: true,
        },
        {
          id: "com.budi.enterprise.monthly",
          plan: "ENTERPRISE",
          period: "monthly",
          features: [
            "Unlimited projects",
            "Unlimited tracks",
            "500 GB storage",
            "Priority queue",
            "HD exports",
            "API access",
          ],
        },
        {
          id: "com.budi.enterprise.yearly",
          plan: "ENTERPRISE",
          period: "yearly",
          features: [
            "Unlimited projects",
            "Unlimited tracks",
            "500 GB storage",
            "Priority queue",
            "HD exports",
            "API access",
            "2 months free",
          ],
        },
      ],
    };
  });
};

export default iapRoutes;
