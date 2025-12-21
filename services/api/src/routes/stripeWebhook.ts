// Stripe webhook handler with raw body processing
import type { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";
import {
  stripe,
  handleSubscriptionChange,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoiceFailed,
} from "../lib/stripe.js";

const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  if (!stripe) {
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Register raw body parser for this route
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, payload, done) => {
      done(null, payload);
    }
  );

  app.post<{ Body: Buffer }>("/api/v1/stripe/webhook", async (request, reply) => {
    if (!webhookSecret) {
      request.log.error("STRIPE_WEBHOOK_SECRET not configured");
      return reply.code(500).send({ error: "Webhook not configured" });
    }

    const signature = request.headers["stripe-signature"] as string;
    if (!signature) {
      return reply.code(400).send({ error: "Missing stripe-signature header" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body, signature, webhookSecret);
    } catch (err) {
      request.log.error(err, "Webhook signature verification failed");
      return reply.code(400).send({ error: "Invalid signature" });
    }

    request.log.info({ type: event.type, id: event.id }, "Processing Stripe webhook");

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionChange(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case "invoice.paid":
          await handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await handleInvoiceFailed(event.data.object as Stripe.Invoice);
          break;

        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          request.log.info({ sessionId: session.id }, "Checkout session completed");
          break;
        }

        default:
          request.log.info({ type: event.type }, "Unhandled Stripe event type");
      }
    } catch (err) {
      request.log.error(err, "Error processing Stripe webhook");
      return reply.code(500).send({ error: "Webhook processing failed" });
    }

    return { received: true };
  });
};

export default stripeWebhookRoutes;
