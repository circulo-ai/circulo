import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { api, notFound, success } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = api({ auth: true }, async (req, { user }) => {
  const subscription = await SubscriptionManager.getActiveSubscription(user.id);

  if (!subscription) {
    return notFound("No active subscription");
  }

  return success({ subscription });
});
