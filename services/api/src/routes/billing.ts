// Billing routes for Stripe integration
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  stripe,
  PRICE_IDS,
  createCheckoutSession,
  createPortalSession,
  getSubscription,
} from "../lib/stripe.js";
import prisma from "../lib/db.js";
import { getUsageStatus } from "../lib/planLimits.js";

const billingRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Get available plans and pricing - always available (doesn't require Stripe)
   */
  app.get("/api/v1/billing/plans", async () => {
    return {
      plans: [
        {
          id: "FREE",
          name: "Free",
          price: 0,
          interval: "month",
          priceIds: null,
          features: [
            "Basic audio mastering",
            "Standard queue priority",
            "Community support",
          ],
          limits: {
            projects: 3,
            tracksPerMonth: 10,
            storageGb: 1,
          },
        },
        {
          id: "PRO",
          name: "Pro",
          price: 19,
          interval: "month",
          priceIds: {
            monthly: PRICE_IDS.PRO_MONTHLY,
            yearly: PRICE_IDS.PRO_YEARLY,
          },
          features: [
            "Advanced audio mastering",
            "Priority queue",
            "HD exports (24-bit)",
            "Email support",
          ],
          limits: {
            projects: 25,
            tracksPerMonth: 100,
            storageGb: 50,
          },
          popular: true,
        },
        {
          id: "ENTERPRISE",
          name: "Enterprise",
          price: 99,
          interval: "month",
          priceIds: {
            monthly: PRICE_IDS.ENTERPRISE_MONTHLY,
            yearly: PRICE_IDS.ENTERPRISE_YEARLY,
          },
          features: [
            "Unlimited mastering",
            "Priority queue",
            "HD exports (24-bit)",
            "API access",
            "Dedicated support",
          ],
          limits: {
            projects: -1,
            tracksPerMonth: -1,
            storageGb: 500,
          },
        },
      ],
    };
  });

  // Check if Stripe is configured for payment-related routes
  if (!stripe) {
    // Register stub routes that return 503 for payment-related endpoints only
    app.get("/api/v1/billing/subscription", { preHandler: [app.authenticate] }, async (_request, reply) => {
      reply.code(503).send({
        error: "Service Unavailable",
        message: "Billing is not configured",
      });
    });
    app.post("/api/v1/billing/checkout", { preHandler: [app.authenticate] }, async (_request, reply) => {
      reply.code(503).send({
        error: "Service Unavailable",
        message: "Billing is not configured",
      });
    });
    app.post("/api/v1/billing/portal", { preHandler: [app.authenticate] }, async (_request, reply) => {
      reply.code(503).send({
        error: "Service Unavailable",
        message: "Billing is not configured",
      });
    });
    app.get("/api/v1/billing/invoices", { preHandler: [app.authenticate] }, async (_request, reply) => {
      reply.code(503).send({
        error: "Service Unavailable",
        message: "Billing is not configured",
      });
    });
    return;
  }

  /**
   * Get current subscription status
   */
  app.get(
    "/api/v1/billing/subscription",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId!;

      const subscription = await getSubscription(userId);
      if (!subscription) {
        return reply.code(404).send({ error: "User not found" });
      }

      // Get usage status
      const usage = await getUsageStatus(userId, subscription.plan);

      return {
        subscription,
        usage,
      };
    }
  );

  /**
   * Create checkout session for subscription
   */
  app.post<{
    Body: {
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    };
  }>(
    "/api/v1/billing/checkout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = request.userId!;
      const { priceId, successUrl, cancelUrl } = request.body;

      if (!priceId || !successUrl || !cancelUrl) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "priceId, successUrl, and cancelUrl are required",
        });
      }

      // Validate price ID
      const validPriceIds = Object.values(PRICE_IDS);
      if (!validPriceIds.includes(priceId)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid price ID",
        });
      }

      try {
        const checkoutUrl = await createCheckoutSession(
          userId,
          priceId,
          successUrl,
          cancelUrl
        );

        return { url: checkoutUrl };
      } catch (error) {
        request.log.error(error, "Failed to create checkout session");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to create checkout session",
        });
      }
    }
  );

  /**
   * Create customer portal session
   */
  app.post<{
    Body: { returnUrl: string };
  }>(
    "/api/v1/billing/portal",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = request.userId!;
      const { returnUrl } = request.body;

      if (!returnUrl) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "returnUrl is required",
        });
      }

      try {
        const portalUrl = await createPortalSession(userId, returnUrl);
        return { url: portalUrl };
      } catch (error) {
        request.log.error(error, "Failed to create portal session");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to create portal session",
        });
      }
    }
  );

  /**
   * Get invoices for current user
   */
  app.get(
    "/api/v1/billing/invoices",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.userId!;

      const invoices = await prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return { invoices };
    }
  );

};

export default billingRoutes;
