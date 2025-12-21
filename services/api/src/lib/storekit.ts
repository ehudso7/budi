// StoreKit 2 Server-Side Integration for iOS In-App Purchases
import prisma from "./db.js";
import { auditSubscription, auditPayment } from "./audit.js";
import type { Plan } from "../../generated/prisma/index.js";

// App Store configuration
const APP_STORE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.budi.app";
const APP_STORE_ISSUER_ID = process.env.APPLE_ISSUER_ID;
const APP_STORE_KEY_ID = process.env.APPLE_KEY_ID;
const APP_STORE_KEY = process.env.APPLE_PRIVATE_KEY; // P8 key contents

const IS_SANDBOX = process.env.NODE_ENV !== "production";
const APP_STORE_API_URL = IS_SANDBOX
  ? "https://api.storekit-sandbox.itunes.apple.com"
  : "https://api.storekit.itunes.apple.com";

// Product ID to Plan mapping
const PRODUCT_TO_PLAN: Record<string, Plan> = {
  "com.budi.pro.monthly": "PRO",
  "com.budi.pro.yearly": "PRO",
  "com.budi.enterprise.monthly": "ENTERPRISE",
  "com.budi.enterprise.yearly": "ENTERPRISE",
};

interface JWSTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  expiresDate?: number;
  type: "Auto-Renewable Subscription" | "Non-Renewing Subscription" | "Consumable" | "Non-Consumable";
  environment: "Production" | "Sandbox";
  appAccountToken?: string;
}

interface JWSRenewalInfo {
  autoRenewProductId: string;
  autoRenewStatus: number;
  expirationIntent?: number;
  isInBillingRetryPeriod?: boolean;
  priceIncreaseStatus?: number;
}

/**
 * Generate JWT for App Store Connect API
 */
async function generateAppStoreToken(): Promise<string> {
  if (!APP_STORE_KEY || !APP_STORE_KEY_ID || !APP_STORE_ISSUER_ID) {
    throw new Error("App Store credentials not configured");
  }

  const { SignJWT, importPKCS8 } = await import("jose");

  const privateKey = await importPKCS8(APP_STORE_KEY, "ES256");

  const token = await new SignJWT({
    iss: APP_STORE_ISSUER_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: "appstoreconnect-v1",
    bid: APP_STORE_BUNDLE_ID,
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: APP_STORE_KEY_ID,
      typ: "JWT",
    })
    .sign(privateKey);

  return token;
}

/**
 * Verify and decode a JWS transaction from StoreKit
 *
 * TODO: SECURITY - Implement full JWS signature verification:
 * 1. Extract x5c certificate chain from header
 * 2. Verify chain against Apple's root CA
 * 3. Use jwtVerify with leaf certificate public key
 * 4. Validate bundleId and environment claims
 *
 * Current implementation only decodes the payload for development.
 * This MUST be implemented before production use.
 */
async function verifyJWSTransaction(
  signedTransaction: string
): Promise<JWSTransactionInfo> {
  // TODO: In production, implement full verification using jose:
  // const { jwtVerify, importX509 } = await import("jose");
  // Extract x5c from header, verify cert chain, then jwtVerify

  const payloadB64 = signedTransaction.split(".")[1];
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

  // Validate required fields
  if (!payload.bundleId || !payload.transactionId) {
    throw new Error("Invalid transaction payload");
  }

  return payload as JWSTransactionInfo;
}

/**
 * Get subscription status from App Store
 */
export async function getSubscriptionStatus(
  transactionId: string
): Promise<{
  status: number;
  transactions: JWSTransactionInfo[];
  renewalInfo?: JWSRenewalInfo;
}> {
  const token = await generateAppStoreToken();

  const response = await fetch(
    `${APP_STORE_API_URL}/inApps/v1/subscriptions/${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`App Store API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Look up transaction history for a user
 */
export async function getTransactionHistory(
  originalTransactionId: string
): Promise<JWSTransactionInfo[]> {
  const token = await generateAppStoreToken();

  const response = await fetch(
    `${APP_STORE_API_URL}/inApps/v1/history/${originalTransactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`App Store API error: ${response.status}`);
  }

  const data = await response.json();

  // Verify and decode each transaction
  const transactions: JWSTransactionInfo[] = [];
  for (const signed of data.signedTransactions || []) {
    const tx = await verifyJWSTransaction(signed);
    transactions.push(tx);
  }

  return transactions;
}

/**
 * Verify a purchase from the iOS app
 */
export async function verifyPurchase(
  userId: string,
  signedTransaction: string
): Promise<{
  valid: boolean;
  plan?: Plan;
  expiresAt?: Date;
  transactionId?: string;
}> {
  try {
    const transaction = await verifyJWSTransaction(signedTransaction);

    // Verify bundle ID
    if (transaction.bundleId !== APP_STORE_BUNDLE_ID) {
      return { valid: false };
    }

    // Check if subscription is still valid
    const now = Date.now();
    if (transaction.expiresDate && transaction.expiresDate < now) {
      return { valid: false };
    }

    // Map product to plan
    const plan = PRODUCT_TO_PLAN[transaction.productId];
    if (!plan) {
      console.error("Unknown product ID:", transaction.productId);
      return { valid: false };
    }

    // Update user subscription
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan,
        subscriptionStatus: "ACTIVE",
        subscriptionId: `apple:${transaction.originalTransactionId}`,
        currentPeriodEnd: transaction.expiresDate
          ? new Date(transaction.expiresDate)
          : null,
      },
    });

    await auditSubscription(userId, "subscription_create", transaction.transactionId, {
      source: "apple",
      productId: transaction.productId,
      plan,
    });

    return {
      valid: true,
      plan,
      expiresAt: transaction.expiresDate ? new Date(transaction.expiresDate) : undefined,
      transactionId: transaction.transactionId,
    };
  } catch (error) {
    console.error("Failed to verify purchase:", error);
    return { valid: false };
  }
}

/**
 * Handle App Store Server Notification V2
 */
export async function handleServerNotification(
  signedPayload: string
): Promise<void> {
  // Decode the notification
  const payloadB64 = signedPayload.split(".")[1];
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

  const notificationType = payload.notificationType;
  const subtype = payload.subtype;

  // Get transaction info from the notification
  const transactionInfo = payload.data?.signedTransactionInfo
    ? await verifyJWSTransaction(payload.data.signedTransactionInfo)
    : null;

  if (!transactionInfo) {
    console.error("No transaction info in notification");
    return;
  }

  // Find user by appAccountToken (we set this during purchase)
  const userId = transactionInfo.appAccountToken;
  if (!userId) {
    // Try to find by subscription ID
    const user = await prisma.user.findFirst({
      where: {
        subscriptionId: `apple:${transactionInfo.originalTransactionId}`,
      },
    });
    if (!user) {
      console.error("No user found for transaction:", transactionInfo.originalTransactionId);
      return;
    }
  }

  const targetUserId = userId || (await prisma.user.findFirst({
    where: { subscriptionId: `apple:${transactionInfo.originalTransactionId}` },
  }))?.id;

  if (!targetUserId) return;

  // Handle different notification types
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW": {
      const plan = PRODUCT_TO_PLAN[transactionInfo.productId] || "PRO";
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          plan,
          subscriptionStatus: "ACTIVE",
          currentPeriodEnd: transactionInfo.expiresDate
            ? new Date(transactionInfo.expiresDate)
            : null,
        },
      });
      await auditSubscription(targetUserId, "subscription_update", transactionInfo.transactionId, {
        type: notificationType,
        plan,
      });
      break;
    }

    case "EXPIRED":
    case "DID_FAIL_TO_RENEW": {
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          plan: "FREE",
          subscriptionStatus: subtype === "BILLING_RETRY" ? "PAST_DUE" : "CANCELED",
        },
      });
      await auditSubscription(targetUserId, "subscription_cancel", transactionInfo.transactionId, {
        type: notificationType,
        subtype,
      });
      break;
    }

    case "DID_CHANGE_RENEWAL_PREF": {
      // User changed auto-renewal
      const renewalInfo = payload.data?.signedRenewalInfo
        ? JSON.parse(
            Buffer.from(
              payload.data.signedRenewalInfo.split(".")[1],
              "base64url"
            ).toString()
          )
        : null;

      if (renewalInfo?.autoRenewStatus === 0) {
        // User disabled auto-renewal
        await auditSubscription(targetUserId, "subscription_update", transactionInfo.transactionId, {
          autoRenew: false,
        });
      }
      break;
    }

    case "REFUND": {
      // User got a refund - revoke access
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          plan: "FREE",
          subscriptionStatus: "CANCELED",
          currentPeriodEnd: null,
        },
      });
      await auditPayment(targetUserId, "payment_failed", transactionInfo.transactionId, {
        reason: "refund",
      });
      break;
    }

    default:
      console.log("Unhandled App Store notification:", notificationType);
  }
}

/**
 * Restore purchases for a user (called from iOS app)
 */
export async function restorePurchases(
  userId: string,
  signedTransactions: string[]
): Promise<{
  restored: boolean;
  plan: Plan;
  expiresAt?: Date;
}> {
  let latestPlan: Plan = "FREE";
  let latestExpiry: Date | undefined;

  for (const signed of signedTransactions) {
    try {
      const transaction = await verifyJWSTransaction(signed);

      if (transaction.bundleId !== APP_STORE_BUNDLE_ID) continue;

      // Check if still valid
      if (transaction.expiresDate && transaction.expiresDate > Date.now()) {
        const plan = PRODUCT_TO_PLAN[transaction.productId];
        if (plan) {
          // Keep the highest tier plan
          if (
            plan === "ENTERPRISE" ||
            (plan === "PRO" && latestPlan === "FREE")
          ) {
            latestPlan = plan;
            latestExpiry = new Date(transaction.expiresDate);
          }
        }
      }
    } catch {
      // Skip invalid transactions
    }
  }

  if (latestPlan !== "FREE") {
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: latestPlan,
        subscriptionStatus: "ACTIVE",
        currentPeriodEnd: latestExpiry,
      },
    });
  }

  return {
    restored: latestPlan !== "FREE",
    plan: latestPlan,
    expiresAt: latestExpiry,
  };
}
