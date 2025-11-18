import { getSession } from "@/lib/auth";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
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
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const metrics = ["api_calls", "kb_slots", "chat_messages", "chats_created"];
    const usage: Record<string, number> = {};

    for (const metric of metrics) {
      usage[metric] = await UsageTracker.getUsage(
        userId,
        metric,
        monthStart,
        now,
      );
    }

    usage["chat_messages_today"] = await UsageTracker.getUsage(
      userId,
      "chat_messages",
      dayStart,
      now,
    );

    const stats = await UsageRateLimiter.getUsageStats(userId);

    return NextResponse.json({
      usage,
      periodStart: monthStart,
      periodEnd: now,
      stats,
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 },
    );
  }
}
