import { auth } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";

const router = createRouter();

router.on(["POST", "GET"], "/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

router.get("/foo", requireAuth, (c) => {
  const orgId = c.get("requestId");

  return c.json({})
});


export default router;
