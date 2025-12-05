import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";

const logger = createLogger("UpdateUserProfileAPI");

const UpdateProfileSchema = z
  .object({
    name: z.string().min(1, "Name is required").optional(),
    image: z
      .string()
      .refine(
        (val) => {
          return (
            val.startsWith("http://") ||
            val.startsWith("https://") ||
            val.startsWith("/api/")
          );
        },
        { message: "Invalid image URL" },
      )
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.image !== undefined, {
    message: "At least one field (name or image) must be provided",
  });

const router = createRouter();

router.get("/users/me/profile", requireAuth, async (c) => {
  const requestId = generateRequestId();
  const userId = c.var.user?.id;

  if (!userId) {
    logger.warn(`[${requestId}] Unauthorized profile fetch attempt`);
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [userRecord] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      emailVerified: userTable.emailVerified,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!userRecord) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: userRecord });
});

router.patch(
  "/users/me/profile",
  requireAuth,
  zValidator("json", UpdateProfileSchema),
  async (c) => {
    const requestId = generateRequestId();
    const userId = c.var.user?.id;

    if (!userId) {
      logger.warn(`[${requestId}] Unauthorized profile update attempt`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = c.req.valid("json");

    const updateData: { updatedAt: Date; name?: string; image?: string | null } =
      { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.image !== undefined) updateData.image = body.image;

    const [updatedUser] = await db
      .update(userTable)
      .set(updateData)
      .where(eq(userTable.id, userId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    logger.info(`[${requestId}] User profile updated`, {
      userId,
      updatedFields: Object.keys(body),
    });

    return c.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        image: updatedUser.image,
      },
    });
  },
);

export default router;
