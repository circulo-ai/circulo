import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { api, success } from "@/lib/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const changePlanSchema = z.object({
  planSlug: z.string().min(1),
  provider: z.enum(["changelly"]).default("changelly"),
});

export const POST = api(
  { auth: true, body: changePlanSchema },
  async (req, { user, body }) => {
    const { planSlug, provider } = body;

    const result = await SubscriptionManager.changePlan(
      user.id,
      planSlug,
      provider,
    );

    return success({
      subscription: result.subscription,
      checkoutUrl: result.invoice?.checkoutUrl,
      invoiceId: result.invoice?.invoice?.id,
    });
  },
);
