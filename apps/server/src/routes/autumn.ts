import { getActiveOrganizationId, getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { autumnHandler } from "autumn-js/next";

const router = createRouter();

router.all("/autumn/*", async (c) => {
  const handler = autumnHandler({
    identify: async () => {
      const session = await getSession(c.req.raw);

      return {
        customerId: await getActiveOrganizationId(c.req.raw),
        customerData: {
          userId: session?.user?.id,
          name: session?.user?.name,
          email: session?.user?.email,
        },
      };
    },
  });

  const method = c.req.method.toUpperCase();
  if (method === "GET" && handler.GET) {
    return handler.GET(c.req.raw as any);
  }
  if (method === "POST" && handler.POST) {
    return handler.POST(c.req.raw as any);
  }

  return c.json({ error: "Method not allowed" }, 405);
});

export default router;
