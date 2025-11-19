import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { UsageTracker } from "@/lib/billing/usage-tracker";
import { api, success } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = api({ auth: true }, async (req, { user }) => {
  const userId = user.id;

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

  return success({
    usage,
    periodStart: monthStart,
    periodEnd: now,
    stats,
  });
});
