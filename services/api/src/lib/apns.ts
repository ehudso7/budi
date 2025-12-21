// Apple Push Notification Service (APNs) integration
import prisma from "./db.js";
import { createAuditLog } from "./audit.js";

// APNs configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.budi.app";
const APNS_KEY = process.env.APNS_KEY; // P8 key contents
const APNS_PRODUCTION = process.env.NODE_ENV === "production";

const APNS_HOST = APNS_PRODUCTION
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

interface APNsPayload {
  aps: {
    alert?: {
      title: string;
      subtitle?: string;
      body: string;
    };
    badge?: number;
    sound?: string;
    "content-available"?: number;
    "mutable-content"?: number;
    category?: string;
    "thread-id"?: string;
  };
  [key: string]: unknown;
}

/**
 * Generate JWT for APNs authentication
 */
async function generateAPNsToken(): Promise<string> {
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    throw new Error("APNs credentials not configured");
  }

  // Import jose for JWT generation
  const { SignJWT, importPKCS8 } = await import("jose");

  const privateKey = await importPKCS8(APNS_KEY, "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: APNS_KEY_ID,
    })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt()
    .sign(privateKey);

  return token;
}

/**
 * Send push notification via APNs HTTP/2
 */
async function sendToAPNs(
  deviceToken: string,
  payload: APNsPayload,
  options: {
    expiration?: number;
    priority?: 5 | 10;
    collapseId?: string;
    pushType?: "alert" | "background" | "voip";
  } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await generateAPNsToken();

    const response = await fetch(
      `https://${APNS_HOST}/3/device/${deviceToken}`,
      {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "apns-topic": APNS_BUNDLE_ID,
          "apns-push-type": options.pushType || "alert",
          "apns-priority": String(options.priority || 10),
          "apns-expiration": String(options.expiration || 0),
          ...(options.collapseId && { "apns-collapse-id": options.collapseId }),
        },
        body: JSON.stringify(payload),
      }
    );

    if (response.ok) {
      return { success: true };
    }

    const error = await response.json().catch(() => ({ reason: "unknown" }));
    return { success: false, error: error.reason || `HTTP ${response.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Register a device token for push notifications
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: "IOS" | "ANDROID" = "IOS"
): Promise<void> {
  // Upsert to handle token updates
  await prisma.deviceToken.upsert({
    where: { token },
    create: {
      userId,
      token,
      platform,
    },
    update: {
      userId,
      platform,
      updatedAt: new Date(),
    },
  });
}

/**
 * Unregister a device token
 */
export async function unregisterDeviceToken(token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({
    where: { token },
  });
}

/**
 * Get all device tokens for a user
 */
export async function getUserDeviceTokens(
  userId: string
): Promise<Array<{ token: string; platform: "IOS" | "ANDROID" }>> {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true, platform: true },
  });
  return tokens;
}

/**
 * Send push notification to a user
 */
export async function sendPushNotification(
  userId: string,
  notification: {
    title: string;
    subtitle?: string;
    body: string;
    badge?: number;
    sound?: string;
    category?: string;
    threadId?: string;
    data?: Record<string, unknown>;
  }
): Promise<{ sent: number; failed: number }> {
  const tokens = await getUserDeviceTokens(userId);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const { token, platform } of tokens) {
    if (platform !== "IOS") {
      // Skip Android tokens for now (would use FCM)
      continue;
    }

    const payload: APNsPayload = {
      aps: {
        alert: {
          title: notification.title,
          subtitle: notification.subtitle,
          body: notification.body,
        },
        badge: notification.badge,
        sound: notification.sound || "default",
        category: notification.category,
        "thread-id": notification.threadId,
      },
      ...notification.data,
    };

    const result = await sendToAPNs(token, payload);

    if (result.success) {
      sent++;
    } else {
      failed++;

      // Remove invalid tokens
      if (
        result.error === "BadDeviceToken" ||
        result.error === "Unregistered"
      ) {
        await unregisterDeviceToken(token);
      }
    }
  }

  return { sent, failed };
}

/**
 * Send silent background notification
 */
export async function sendBackgroundNotification(
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  const tokens = await getUserDeviceTokens(userId);

  for (const { token, platform } of tokens) {
    if (platform !== "IOS") continue;

    const payload: APNsPayload = {
      aps: {
        "content-available": 1,
      },
      ...data,
    };

    await sendToAPNs(token, payload, {
      pushType: "background",
      priority: 5,
    });
  }
}

// Notification templates for common events
export const NotificationTemplates = {
  trackAnalyzed: (trackName: string) => ({
    title: "Analysis Complete",
    body: `Your track "${trackName}" has been analyzed and is ready for review.`,
    category: "TRACK_ANALYZED",
  }),

  trackMastered: (trackName: string) => ({
    title: "Mastering Complete",
    body: `Your track "${trackName}" has been mastered and is ready for download.`,
    category: "TRACK_MASTERED",
  }),

  trackExported: (trackName: string) => ({
    title: "Export Ready",
    body: `Your export for "${trackName}" is ready for download.`,
    category: "TRACK_EXPORTED",
  }),

  projectComplete: (projectName: string) => ({
    title: "Project Complete",
    body: `All tracks in "${projectName}" have been processed.`,
    category: "PROJECT_COMPLETE",
  }),

  subscriptionExpiring: (daysLeft: number) => ({
    title: "Subscription Expiring",
    body: `Your subscription expires in ${daysLeft} days. Renew to keep your Pro features.`,
    category: "SUBSCRIPTION_ALERT",
  }),

  paymentFailed: () => ({
    title: "Payment Failed",
    body: "We couldn't process your payment. Please update your payment method.",
    category: "PAYMENT_ALERT",
  }),
};

/**
 * Notify user about job completion
 */
export async function notifyJobComplete(
  userId: string,
  jobType: "analyze" | "master" | "export",
  trackName: string
): Promise<void> {
  let notification;

  switch (jobType) {
    case "analyze":
      notification = NotificationTemplates.trackAnalyzed(trackName);
      break;
    case "master":
      notification = NotificationTemplates.trackMastered(trackName);
      break;
    case "export":
      notification = NotificationTemplates.trackExported(trackName);
      break;
  }

  await sendPushNotification(userId, notification);

  await createAuditLog({
    userId,
    action: "track_export", // Using closest match
    resource: "track",
    metadata: { notification: jobType, trackName },
  });
}
