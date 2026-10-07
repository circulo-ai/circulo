import { createRouter } from "@/lib/create-app";
import {
  ensureInstanceAuthSettings,
  getRuntimeKind,
  isInstanceManagedRuntime,
  isSystemAdmin,
  updateSignupPolicy,
} from "@/lib/deployment/instance-auth";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const router = createRouter();

router.get("/instance/info", async (c) => {
  const runtimeKind = getRuntimeKind();
  if (!isInstanceManagedRuntime()) {
    return c.json({
      runtimeKind,
      localAuth: false,
      signupEnabled: true,
      bootstrapRequired: false,
    });
  }

  const settings = await ensureInstanceAuthSettings();
  return c.json({
    runtimeKind,
    localAuth: true,
    signupEnabled: settings.signupEnabled || !settings.bootstrapCompleted,
    bootstrapRequired: !settings.bootstrapCompleted,
  });
});

router.get("/instance/auth-policy", requireAuth, async (c) => {
  if (!isInstanceManagedRuntime()) {
    return c.json({ error: "Not available in cloud runtime" }, 404);
  }
  if (!isSystemAdmin(c.var.user)) {
    return c.json({ error: "Administrator access required" }, 403);
  }

  const settings = await ensureInstanceAuthSettings();
  return c.json({
    runtimeKind: getRuntimeKind(),
    signupEnabled: settings.signupEnabled,
    bootstrapCompleted: settings.bootstrapCompleted,
    bootstrapUserId: settings.bootstrapUserId,
    updatedAt: settings.updatedAt,
  });
});

router.patch(
  "/instance/auth-policy",
  requireAuth,
  zValidator("json", z.object({ signupEnabled: z.boolean() })),
  async (c) => {
    if (!isInstanceManagedRuntime()) {
      return c.json({ error: "Not available in cloud runtime" }, 404);
    }
    if (!isSystemAdmin(c.var.user)) {
      return c.json({ error: "Administrator access required" }, 403);
    }

    const body = c.req.valid("json");
    const settings = await updateSignupPolicy(
      body.signupEnabled,
      c.var.user?.id as string,
    );
    return c.json({
      runtimeKind: getRuntimeKind(),
      signupEnabled: settings.signupEnabled,
      bootstrapCompleted: settings.bootstrapCompleted,
      bootstrapUserId: settings.bootstrapUserId,
      updatedAt: settings.updatedAt,
    });
  },
);

export default router;
