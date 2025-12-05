import { auth } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";

const router = createRouter();

router.post("/auth/socket-token", requireAuth, async (c) => {
  const response = await auth.api.generateOneTimeToken({
    headers: c.req.raw.headers,
  });

  if (!response) {
    return c.json({ error: "Failed to generate token" }, 500);
  }

  return c.json({ token: response.token });
});

export default router;
