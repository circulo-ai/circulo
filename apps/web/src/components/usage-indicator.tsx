import { isBillingEnabled } from "@/lib/environment";
import Link from "next/link";
import useSWR from "swr";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Progress } from "./ui/progress";
import { useSidebar } from "./ui/sidebar";

export function SubscriptionUsageIndicator() {
  const { state } = useSidebar();

  const { data: subscriptionRes } = useSWR(
    isBillingEnabled ? "/api/billing/subscriptions/current" : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    },
  );

  const { data: usageRes } = useSWR(
    isBillingEnabled ? "/api/billing/usage/current" : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    },
  );

  const subscription = subscriptionRes?.subscription;
  const usage = usageRes?.usage as Record<string, number> | undefined;
  const periodStart = usageRes?.periodStart
    ? new Date(usageRes.periodStart)
    : undefined;
  const periodEnd = usageRes?.periodEnd
    ? new Date(usageRes.periodEnd)
    : undefined;
  const stats = usageRes?.stats as
    | {
        agents: { current: number; limit: number | null };
        knowledgeBases: { current: number; limit: number | null };
        chats: { current: number; limit: number | null; resetsAt: string };
        rateLimitPerMinute: number | null;
      }
    | undefined;

  if (!isBillingEnabled) return null;

  const planName: string | undefined = subscription?.plan?.name;
  const features = subscription?.features as
    | {
        maxMessagesPerDay?: number | null;
        rateLimitPerMinute?: number | null;
        kbSlots?: number | null;
        maxAgents?: number | null;
        maxChats?: number | null;
      }
    | undefined;

  const apiCalls = usage?.api_calls ?? 0;
  const chatMessagesToday = usage?.chat_messages_today ?? 0;
  const dailyMsgLimit = features?.maxMessagesPerDay ?? null;
  const dailyMsgPercent =
    dailyMsgLimit && dailyMsgLimit > 0
      ? Math.min(100, Math.floor((chatMessagesToday / dailyMsgLimit) * 100))
      : undefined;

  const kbCurrent = stats?.knowledgeBases.current ?? 0;
  const kbLimit = stats?.knowledgeBases.limit ?? null;
  const kbPercent =
    kbLimit && kbLimit > 0
      ? Math.min(100, Math.floor((kbCurrent / kbLimit) * 100))
      : undefined;

  const agentsCurrent = stats?.agents.current ?? 0;
  const agentsLimit = stats?.agents.limit ?? null;
  const agentsPercent =
    agentsLimit && agentsLimit > 0
      ? Math.min(100, Math.floor((agentsCurrent / agentsLimit) * 100))
      : undefined;

  const chatsCreated = usage?.chats_created ?? 0;
  const chatsLimit = stats?.chats.limit ?? null;
  const chatsPercent =
    chatsLimit && chatsLimit > 0
      ? Math.min(100, Math.floor((chatsCreated / chatsLimit) * 100))
      : undefined;

  const compact = (
    <button
      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-sidebar-accent"
      aria-label="Usage details"
    >
      <span className="ml-2 flex w-full flex-col items-center gap-3 tabular-nums">
        <span className="flex w-full items-center gap-1">
          <span>Msgs</span>
          {dailyMsgPercent != null && (
            <span className="w-full">
              <Progress value={dailyMsgPercent} />
            </span>
          )}
          <span>
            {dailyMsgLimit != null
              ? `${chatMessagesToday}/${dailyMsgLimit}`
              : `${chatMessagesToday}`}
          </span>
        </span>
        <span className="flex w-full items-center gap-1">
          <span>KB</span>
          {kbPercent != null && (
            <span className="w-full">
              <Progress value={kbPercent} />
            </span>
          )}
          <span>
            {kbLimit != null ? `${kbCurrent}/${kbLimit}` : `${kbCurrent}`}
          </span>
        </span>
        <span className="flex w-full items-center gap-1">
          <span>Agents</span>
          {agentsPercent != null && (
            <span className="w-full">
              <Progress value={agentsPercent} />
            </span>
          )}
          <span>
            {agentsLimit != null
              ? `${agentsCurrent}/${agentsLimit}`
              : `${agentsCurrent}`}
          </span>
        </span>
      </span>
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild nativeButton>
        {compact}
      </PopoverTrigger>
      <PopoverContent sideOffset={8} align="end">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {planName ?? "No Active Plan"}
            </span>
            {subscription ? (
              <span className="text-[10px] text-foreground/60 uppercase">
                Active
              </span>
            ) : (
              <Link
                href="/pricing"
                className="text-[10px] text-primary uppercase"
              >
                Upgrade
              </Link>
            )}
          </div>
          {periodStart && periodEnd && (
            <div className="text-[10px] text-foreground/60">
              <span>Period</span>
              <span className="ml-2">
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                }).format(periodStart)}
                {" – "}
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                }).format(periodEnd)}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span>Daily Messages</span>
                <span className="tabular-nums">
                  {dailyMsgLimit != null
                    ? `${chatMessagesToday}/${dailyMsgLimit}`
                    : `${chatMessagesToday}`}
                </span>
              </div>
              {dailyMsgPercent != null && <Progress value={dailyMsgPercent} />}
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span>KB Slots</span>
                <span className="tabular-nums">
                  {kbLimit != null ? `${kbCurrent}/${kbLimit}` : `${kbCurrent}`}
                </span>
              </div>
              {kbPercent != null && <Progress value={kbPercent} />}
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span>Agents</span>
                <span className="tabular-nums">
                  {agentsLimit != null
                    ? `${agentsCurrent}/${agentsLimit}`
                    : `${agentsCurrent}`}
                </span>
              </div>
              {agentsPercent != null && <Progress value={agentsPercent} />}
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span>Chats This Month</span>
                <span className="tabular-nums">
                  {chatsLimit != null
                    ? `${chatsCreated}/${chatsLimit}`
                    : `${chatsCreated}`}
                </span>
              </div>
              {chatsPercent != null && <Progress value={chatsPercent} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span>API Calls (MTD)</span>
                <span className="tabular-nums">{apiCalls}</span>
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span>Rate Limit</span>
                <span className="tabular-nums">
                  {features?.rateLimitPerMinute ??
                    stats?.rateLimitPerMinute ??
                    "∞"}
                  /min
                </span>
              </div>
            </div>
          </div>
          {!subscription && (
            <div className="mt-1">
              <Link href="/pricing" className="text-xs text-primary">
                View plans
              </Link>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
