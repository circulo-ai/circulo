import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { api, success } from "@/lib/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSubscriptionSchema = z.object({
  planSlug: z.string().min(1),
  provider: z.enum(["changelly"]).default("changelly"),
});

export const POST = api(
  { auth: true, body: createSubscriptionSchema },
  async (req, { user, body }) => {
    const { planSlug, provider } = body;

    const invoice = await SubscriptionManager.createSubscriptionInvoice(
      user.id,
      planSlug,
      provider,
    );

    return success({
      invoice,
    });
  },
);
