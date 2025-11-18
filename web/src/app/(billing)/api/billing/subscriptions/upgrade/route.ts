import { getSession } from "@/lib/auth";
import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const changePlanSchema = z.object({
  planSlug: z.string().min(1),
  provider: z.enum(["changelly"]).default("changelly"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.user.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = changePlanSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { planSlug, provider } = validation.data;

    const result = await SubscriptionManager.changePlan(
      userId,
      planSlug,
      provider,
    );

    return NextResponse.json({
      subscription: result.subscription,
      checkoutUrl: result.invoice?.checkoutUrl,
      invoiceId: result.invoice?.invoice?.id,
    });
  } catch (error) {
    console.error("Error changing plan:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to change plan" },
      { status: 500 },
    );
  }
}
