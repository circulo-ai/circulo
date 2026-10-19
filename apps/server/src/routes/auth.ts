import { auth } from "@/lib/auth";
import { consumeDesktopPasswordResetLink } from "@/lib/auth/desktop-password-reset";
import { createRouter } from "@/lib/create-app";
import { getRuntimeKind } from "@/lib/deployment/instance-auth";
import { env } from "@/lib/env";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const router = createRouter();

router.post(
  "/auth/desktop/password-reset-link",
  zValidator("json", z.object({ email: z.email().max(254) })),
  (c) => {
    if (getRuntimeKind() !== "desktop") return c.json({ resetUrl: null }, 404);

    const origin = c.req.header("Origin");
    let appOrigin: string;
    try {
      appOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
    } catch {
      return c.json({ resetUrl: null }, 403);
    }
    if (!origin || origin !== appOrigin) {
      return c.json({ resetUrl: null }, 403);
    }

    const { email } = c.req.valid("json");
    return c.json({ resetUrl: consumeDesktopPasswordResetLink(email) });
  },
);

// Forward all auth routes (any method) to Better Auth handler
router.all("/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

export default router;
