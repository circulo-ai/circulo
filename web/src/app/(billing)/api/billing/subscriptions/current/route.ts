import { getSession } from "@/lib/auth";
import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await SubscriptionManager.getActiveSubscription(
      session.user.id,
    );

    if (!subscription) {
      return NextResponse.json(
        { error: "No active subscription" },
        { status: 404 },
      );
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 },
    );
  }
}
