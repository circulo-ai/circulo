import { getSession } from "@/lib/auth";
import { UsageTracker } from "@/lib/billing/usage-tracker";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.user.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const metrics = ["api_calls", "kb_slots"];
    const usage: Record<string, number> = {};

    for (const metric of metrics) {
      usage[metric] = await UsageTracker.getUsage(
        userId,
        metric,
        monthStart,
        now,
      );
    }

    return NextResponse.json({
      usage,
      periodStart: monthStart,
      periodEnd: now,
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 },
    );
  }
}
