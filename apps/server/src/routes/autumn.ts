import { getActiveOrganizationId, getSession } from "@/lib/auth";
import { createRouter, type AppEnv } from "@/lib/create-app";
import { env } from "@/lib/env";
import { autumnHandler } from "autumn-js/hono";

import type { Context, MiddlewareHandler } from "hono";

const router = createRouter();

const autumnMiddleware: MiddlewareHandler<AppEnv> = env.AUTUMN_SECRET_KEY
  ? (autumnHandler({
      pathPrefix: "/api/auth/autumn",
      secretKey: env.AUTUMN_SECRET_KEY,
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
    }) as unknown as MiddlewareHandler<AppEnv>)
  : async (c: Context<AppEnv>) => {
      const url = new URL(c.req.url);
      if (url.pathname.endsWith("/products")) {
        return c.json({ list: [] }, 200);
      }
      if (url.pathname.endsWith("/customers")) {
        return c.json({ customer: null }, 200);
      }
      return c.json(
        { message: "Billing is not configured in local environment" },
        200,
      );
    };

// Register concrete handlers as well as middleware. Hono does not dispatch a
// middleware-only path when no route is registered, which made the frontend's
// /api/auth/autumn/products and /customers calls return 404 locally.
router.all("/auth/autumn", autumnMiddleware);
router.all("/auth/autumn/*", autumnMiddleware);

export default router;
