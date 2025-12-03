import { auth } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";

const router = createRouter();

// Forward all auth routes (any method) to Better Auth handler
router.all("/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

export default router;
