import { getSubscriptionPlans } from "@/app/(billing)/actions/get-plans";
import { api, success } from "@/lib/server";
import { NextRequest } from "next/server";

export const GET = api({}, async (req: NextRequest, ctx) => {

  const plans = await getSubscriptionPlans();
  return success({ plans });
});
