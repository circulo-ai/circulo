import { getActiveOrganizationId, getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { autumnHandler } from "autumn-js/hono";

const router = createRouter();

const autumnMiddleware = autumnHandler({
  identify: async (ctx) => {
    const session = await getSession(ctx.req.raw);

    return {
      customerId: await getActiveOrganizationId(ctx.req.raw),
      customerData: {
        userId: session?.user?.id,
        name: session?.user?.name,
        email: session?.user?.email,
      },
    };
  },
});

router.use("/autumn/*", autumnMiddleware);

export default router;
