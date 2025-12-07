import type { EmailType } from "@/lib/email/mailer";
import {
  getEmailPreferences,
  isTransactionalEmail,
  unsubscribeFromAll,
  updateEmailPreferences,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const logger = createLogger("UnsubscribeAPI");

const unsubscribeSchema = z.object({
  email: z.string().email("Invalid email address"),
  token: z.string().min(1, "Token is required"),
  type: z
    .enum(["all", "marketing", "updates", "notifications"])
    .optional()
    .default("all"),
});

const router = createRouter();

router.get("/users/me/settings/unsubscribe", async (c) => {
  const requestId = generateRequestId();

  try {
    const { searchParams } = new URL(c.req.url);
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!email || !token) {
      logger.warn(`[${requestId}] Missing email or token in GET request`);
      return c.json({ error: "Missing email or token parameter" }, 400);
    }

    const tokenVerification = verifyUnsubscribeToken(email, token);
    if (!tokenVerification.valid) {
      logger.warn(
        `[${requestId}] Invalid unsubscribe token for email: ${email}`,
      );
      return c.json({ error: "Invalid or expired unsubscribe link" }, 400);
    }

    const emailType = tokenVerification.emailType as EmailType;
    const isTransactional = isTransactionalEmail(emailType);
    const preferences = await getEmailPreferences(email);

    logger.info(
      `[${requestId}] Valid unsubscribe GET request for email: ${email}, type: ${emailType}`,
    );

    return c.json({
      success: true,
      email,
      token,
      emailType,
      isTransactional,
      currentPreferences: preferences || {},
    });
  } catch (error) {
    logger.error(
      `[${requestId}] Error processing unsubscribe GET request:`,
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
});

router.post(
  "/users/me/settings/unsubscribe",
  zValidator("json", unsubscribeSchema),
  async (c) => {
    const requestId = generateRequestId();

    try {
      const { email, token, type } = c.req.valid("json");

      const tokenVerification = verifyUnsubscribeToken(email, token);
      if (!tokenVerification.valid) {
        logger.warn(
          `[${requestId}] Invalid unsubscribe token for email: ${email}`,
        );
        return c.json({ error: "Invalid or expired unsubscribe link" }, 400);
      }

      const emailType = tokenVerification.emailType as EmailType;
      const isTransactional = isTransactionalEmail(emailType);

      if (isTransactional) {
        logger.warn(
          `[${requestId}] Attempted to unsubscribe from transactional email: ${email}`,
        );
        return c.json(
          {
            error: "Cannot unsubscribe from transactional emails",
            isTransactional: true,
            message:
              "Transactional emails cannot be unsubscribed from as they contain important account information.",
          },
          400,
        );
      }

      let success = false;
      switch (type) {
        case "all":
          success = await unsubscribeFromAll(email);
          break;
        case "marketing":
          success = await updateEmailPreferences(email, {
            unsubscribeMarketing: true,
          });
          break;
        case "updates":
          success = await updateEmailPreferences(email, {
            unsubscribeUpdates: true,
          });
          break;
        case "notifications":
          success = await updateEmailPreferences(email, {
            unsubscribeNotifications: true,
          });
          break;
      }

      if (!success) {
        logger.error(
          `[${requestId}] Failed to update unsubscribe preferences for: ${email}`,
        );
        return c.json({ error: "Failed to process unsubscribe request" }, 500);
      }

      logger.info(
        `[${requestId}] Successfully unsubscribed ${email} from ${type}`,
      );

      return c.json(
        {
          success: true,
          message: `Successfully unsubscribed from ${type} emails`,
          email,
          type,
          emailType,
        },
        200,
      );
    } catch (error) {
      logger.error(
        `[${requestId}] Error processing unsubscribe POST request:`,
        error,
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

export default router;
