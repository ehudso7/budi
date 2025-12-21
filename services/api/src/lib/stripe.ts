// Stripe service for payment and subscription management
import Stripe from "stripe";
import prisma from "./db.js";
import type { Plan, SubscriptionStatus } from "../../generated/prisma/index.js";
import { auditSubscription, auditPayment } from "./audit.js";

// Initialize Stripe client
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey && process.env.NODE_ENV === "production") {
  console.warn("STRIPE_SECRET_KEY not configured - billing features disabled");
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2025-12-15.clover" })
  : null;

// Price IDs from Stripe Dashboard (configure in env)
export const PRICE_IDS = {
  PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_pro_monthly",
  PRO_YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY || "price_pro_yearly",
  ENTERPRISE_MONTHLY: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || "price_enterprise_monthly",
  ENTERPRISE_YEARLY: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || "price_enterprise_yearly",
} as const;

// Map Stripe price IDs to plans
const PRICE_TO_PLAN: Record<string, Plan> = {
  [PRICE_IDS.PRO_MONTHLY]: "PRO",
  [PRICE_IDS.PRO_YEARLY]: "PRO",
  [PRICE_IDS.ENTERPRISE_MONTHLY]: "ENTERPRISE",
  [PRICE_IDS.ENTERPRISE_YEARLY]: "ENTERPRISE",
};

/**
 * Ensure Stripe is configured
 */
function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in environment.");
  }
  return stripe;
}

/**
 * Get or create a Stripe customer for a user
 */
export async function getOrCreateCustomer(userId: string): Promise<string> {
  const stripeClient = requireStripe();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, email: true, name: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripeClient.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId },
  });

  // Save customer ID to user
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(
  userId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const stripeClient = requireStripe();
  const customerId = await getOrCreateCustomer(userId);

  const session = await stripeClient.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: 14, // 14-day free trial
      metadata: { userId },
    },
    allow_promotion_codes: true,
  });

  return session.url || "";
}

/**
 * Create a customer portal session for managing subscription
 */
export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<string> {
  const stripeClient = requireStripe();
  const customerId = await getOrCreateCustomer(userId);

  const session = await stripeClient.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Cancel a subscription immediately
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const stripeClient = requireStripe();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionId: true },
  });

  if (!user?.subscriptionId) {
    throw new Error("No active subscription");
  }

  await stripeClient.subscriptions.cancel(user.subscriptionId);
}

/**
 * Handle subscription created/updated webhook
 */
export async function handleSubscriptionChange(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.error("Subscription missing userId in metadata:", subscription.id);
    return;
  }

  // Map Stripe status to our status
  const statusMap: Record<string, SubscriptionStatus> = {
    trialing: "TRIALING",
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    unpaid: "UNPAID",
  };

  const status = statusMap[subscription.status] || "NONE";

  // Get plan from price
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? (PRICE_TO_PLAN[priceId] || "FREE") : "FREE";

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: status,
      plan,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd:
        (subscription as unknown as { current_period_end?: number }).current_period_end
          ? new Date(
              (subscription as unknown as { current_period_end: number }).current_period_end * 1000
            )
          : null,
    },
  });

  // Audit log
  await auditSubscription(userId, "subscription_update", subscription.id, {
    status,
    plan,
    priceId,
  });
}

/**
 * Handle subscription deleted webhook
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: null,
      subscriptionStatus: "CANCELED",
      plan: "FREE",
      currentPeriodEnd: null,
    },
  });

  await auditSubscription(userId, "subscription_cancel", subscription.id);
}

/**
 * Handle invoice payment succeeded
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;

  // Find user by customer ID
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error("No user found for customer:", customerId);
    return;
  }

  // Create invoice record
  await prisma.invoice.create({
    data: {
      userId: user.id,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: "paid",
      paidAt: new Date(),
      invoiceUrl: invoice.hosted_invoice_url || undefined,
    },
  });

  await auditPayment(user.id, "payment_success", invoice.id, {
    amount: invoice.amount_paid,
    currency: invoice.currency,
  });
}

/**
 * Handle invoice payment failed
 */
export async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  // Create invoice record
  await prisma.invoice.create({
    data: {
      userId: user.id,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: "failed",
      invoiceUrl: invoice.hosted_invoice_url || undefined,
    },
  });

  await auditPayment(user.id, "payment_failed", invoice.id, {
    amount: invoice.amount_due,
    attemptCount: invoice.attempt_count,
  });
}

/**
 * Get subscription details for a user
 */
export async function getSubscription(userId: string): Promise<{
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  const stripeClient = requireStripe();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptionStatus: true,
      subscriptionId: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });

  if (!user) return null;

  let cancelAtPeriodEnd = false;

  // Get cancel_at_period_end from Stripe if subscription exists
  if (user.subscriptionId) {
    try {
      const subscription = await stripeClient.subscriptions.retrieve(user.subscriptionId);
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
    } catch {
      // Subscription may not exist in Stripe
    }
  }

  return {
    plan: user.plan,
    status: user.subscriptionStatus,
    trialEndsAt: user.trialEndsAt,
    currentPeriodEnd: user.currentPeriodEnd,
    cancelAtPeriodEnd,
  };
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripeClient = requireStripe();
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  return stripeClient.webhooks.constructEvent(payload, signature, endpointSecret);
}
