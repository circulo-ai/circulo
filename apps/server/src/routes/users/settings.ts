import { db } from "@/db";
import { settings } from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

const logger = createLogger("UserSettingsAPI");

const SettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  emailPreferences: z
    .object({
      unsubscribeAll: z.boolean().optional(),
      unsubscribeMarketing: z.boolean().optional(),
      unsubscribeUpdates: z.boolean().optional(),
      unsubscribeNotifications: z.boolean().optional(),
    })
    .optional(),
});

const defaultSettings = {
  emailPreferences: {},
  theme: "system",
};

const router = createRouter();

router.get("/users/me/settings", requireAuth, async (c) => {
  const requestId = generateRequestId();

  try {
    const userId = c.var.user!.id;
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);

    if (!result.length) {
      return c.json({ data: defaultSettings }, 200);
    }

    const userSettings = result[0];

    if (!userSettings) {
      return c.json({ data: defaultSettings }, 200);
    }

    return c.json(
      {
        data: {
          emailPreferences: userSettings.emailPreferences ?? {},
          theme: userSettings.theme,
        },
      },
      200,
    );
  } catch (error) {
    logger.error(`[${requestId}] Settings fetch error`, error);
    return c.json({ data: defaultSettings }, 200);
  }
});

router.patch(
  "/users/me/settings",
  requireAuth,
  zValidator("json", SettingsSchema),
  async (c) => {
    const requestId = generateRequestId();

    try {
      const userId = c.var.user!.id;
      const validatedData = c.req.valid("json");
      const persistenceData = validatedData;

      await db
        .insert(settings)
        .values({
          id: nanoid(),
          userId,
          ...persistenceData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [settings.userId],
          set: {
            ...persistenceData,
            updatedAt: new Date(),
          },
        });

      return c.json({ success: true }, 200);
    } catch (error) {
      logger.error(`[${requestId}] Settings update error`, error);
      return c.json({ error: "Unable to update settings" }, 500);
    }
  },
);

export default router;
