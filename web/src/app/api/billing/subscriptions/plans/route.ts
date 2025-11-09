import { getSubscriptionPlans } from "@/actions/subscription/get-plans";
import { api, success } from "@/lib/server";
import { NextRequest } from "next/server";

export const GET = api({}, async (req: NextRequest, ctx) => {
  const plans = await getSubscriptionPlans();
  return success({ plans });
});
