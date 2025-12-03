import { getActiveOrganizationId, getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { autumnHandler } from "autumn-js/hono";

const router = createRouter();

const autumnMiddleware = autumnHandler({
  identify: async (ctx) => {
    const session = await getSession(ctx.req.raw);
    const customerId = session
      ? await getActiveOrganizationId(ctx.req.raw).catch(() => undefined)
      : undefined;

    return {
      customerId,
      customerData: session
        ? {
            userId: session?.user?.id,
            name: session?.user?.name,
            email: session?.user?.email,
          }
        : undefined,
    };
  },
});

// Single mount: the frontend points to /auth/autumn
router.use("/auth/autumn/*", autumnMiddleware);

export default router;
