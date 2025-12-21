// Push notification routes
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  registerDeviceToken,
  unregisterDeviceToken,
  getUserDeviceTokens,
  sendPushNotification,
} from "../lib/apns.js";

const notificationRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Register device token for push notifications
   */
  app.post<{
    Body: {
      token: string;
      platform?: "IOS" | "ANDROID";
    };
  }>(
    "/api/v1/notifications/register",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = request.userId!;
      const { token, platform = "IOS" } = request.body;

      if (!token) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Device token is required",
        });
      }

      try {
        await registerDeviceToken(userId, token, platform);
        return { success: true };
      } catch (error) {
        request.log.error(error, "Failed to register device token");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to register device token",
        });
      }
    }
  );

  /**
   * Unregister device token
   */
  app.delete<{
    Body: { token: string };
  }>(
    "/api/v1/notifications/unregister",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { token } = request.body;

      if (!token) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Device token is required",
        });
      }

      try {
        await unregisterDeviceToken(token);
        return { success: true };
      } catch (error) {
        request.log.error(error, "Failed to unregister device token");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to unregister device token",
        });
      }
    }
  );

  /**
   * Get registered devices for current user
   */
  app.get(
    "/api/v1/notifications/devices",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.userId!;

      const devices = await getUserDeviceTokens(userId);

      // Mask tokens for security (show only last 8 chars)
      const maskedDevices = devices.map((d) => ({
        platform: d.platform,
        tokenSuffix: d.token.slice(-8),
      }));

      return { devices: maskedDevices };
    }
  );

  /**
   * Send test notification (for debugging)
   */
  app.post(
    "/api/v1/notifications/test",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply) => {
      const userId = request.userId!;

      // Only allow in development
      if (process.env.NODE_ENV === "production") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Test notifications not available in production",
        });
      }

      try {
        const result = await sendPushNotification(userId, {
          title: "Test Notification",
          body: "This is a test notification from Budi.",
          data: { test: true },
        });

        return {
          success: true,
          sent: result.sent,
          failed: result.failed,
        };
      } catch (error) {
        request.log.error(error, "Failed to send test notification");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to send test notification",
        });
      }
    }
  );

  /**
   * Get notification preferences (placeholder for future settings)
   */
  app.get(
    "/api/v1/notifications/preferences",
    { preHandler: [app.authenticate] },
    async () => {
      // Default preferences - can be expanded to user-specific settings
      return {
        preferences: {
          trackAnalyzed: true,
          trackMastered: true,
          trackExported: true,
          projectComplete: true,
          subscriptionAlerts: true,
          paymentAlerts: true,
          marketingEmails: false,
        },
      };
    }
  );
};

export default notificationRoutes;
