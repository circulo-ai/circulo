"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  PopoverContent as PopoverContentPanel,
  Popover as PopoverRoot,
  PopoverTrigger as PopoverTriggerButton,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type {
  ChatMessage,
  WorkflowAgentTrace,
  WorkflowTrace,
} from "@/lib/types";
import {
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  ListChecks,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ToolCallPart, type ToolPart } from "./tool-call-part";

type WorkflowPart = {
  type: string;
  data?: unknown;
  state?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type ProcessEvent = {
  type: string;
  data: Record<string, unknown>;
};

export function WorkflowProcess({
  isReadonly = false,
  parts,
}: {
  isReadonly?: boolean;
  parts: ChatMessage["parts"];
}) {
  // Streaming UI message parts are intentionally rebuilt on every render.
  // The AI SDK may update a message while retaining nested part references;
  // memoizing this projection can otherwise leave the activity card stuck on
  // its first event until the terminal message arrives.
  const process = buildProcess(parts);
  const [actionStatuses, setActionStatuses] = useState<Record<string, string>>(
    {},
  );
  const [processOpen, setProcessOpen] = useState(false);
  useEffect(() => {
    if (process?.status === "running" || process?.status === "paused") {
      setProcessOpen(true);
    }
  }, [process?.status]);
  if (!process) return null;
  const visibleProcess = {
    ...process,
    approvals: process.approvals.map((approval) => ({
      ...approval,
      status: actionStatuses[approval.id] ?? approval.status,
    })),
    handoffs: process.handoffs.map((handoff) => ({
      ...handoff,
      status: actionStatuses[handoff.id] ?? handoff.status,
    })),
  };

  const decideApproval = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    setActionStatuses((current) => ({ ...current, [id]: "updating" }));
    try {
      const response = await fetch(`/api/automation/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          payload?.message ?? payload?.error ?? "Unable to update approval",
        );
      }
      setActionStatuses((current) => ({ ...current, [id]: status }));
      toast.success(
        status === "approved" ? "Approval granted" : "Approval rejected",
      );
    } catch (error) {
      setActionStatuses((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.error(
        error instanceof Error ? error.message : "Unable to update approval",
      );
    }
  };

  const updateHandoff = async (
    id: string,
    status: "accepted" | "completed" | "rejected",
  ) => {
    setActionStatuses((current) => ({ ...current, [id]: "updating" }));
    try {
      const response = await fetch(`/api/automation/handoffs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          payload?.message ?? payload?.error ?? "Unable to update handoff",
        );
      }
      setActionStatuses((current) => ({ ...current, [id]: status }));
      toast.success(
        status === "completed"
          ? "Handoff marked complete"
          : status === "accepted"
            ? "Handoff accepted"
            : "Handoff rejected",
      );
    } catch (error) {
      setActionStatuses((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.error(
        error instanceof Error ? error.message : "Unable to update handoff",
      );
    }
  };

  return (
    <Collapsible
      className="not-prose w-full overflow-hidden rounded-xl border bg-muted/20 text-sm"
      onOpenChange={setProcessOpen}
      open={processOpen}
    >
      <CollapsibleTrigger asChild nativeButton>
        <button
          className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
              <Sparkles className="size-3.5" />
            </span>
            <span className="truncate font-medium">Workflow process</span>
            <Badge
              className="capitalize"
              variant={
                visibleProcess.status === "failed" ? "destructive" : "secondary"
              }
            >
              {visibleProcess.status}
            </Badge>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span>{visibleProcess.activity.length} steps</span>
            {visibleProcess.executionTimeMs !== undefined &&
              formatDuration(visibleProcess.executionTimeMs)}
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Separator />

        <div className="flex flex-col gap-1 px-3 py-2">
          {process.classification && (
            <ProcessRow
              done
              label={`Classified as ${String(process.classification.complexity ?? "request")}`}
            />
          )}
          {process.plan && (
            <ProcessRow
              done
              label={`Execution plan: ${String(process.plan.strategy ?? "direct")}`}
            />
          )}

          {process.activity.length > 0 && (
            <div className="mt-1 rounded-lg border bg-background/40 p-2">
              <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                Activity
              </div>
              <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {process.activity.map((entry, entryIndex) => (
                  <div
                    className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-xs"
                    key={entry.id}
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                      {entryIndex + 1}
                    </span>
                    {entry.status === "error" ? (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : entry.status === "running" ||
                      entry.status === "paused" ? (
                      <CircleDot className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{entry.label}</span>
                      {entry.detail && (
                        <span className="ml-1 text-muted-foreground">
                          {entry.detail}
                        </span>
                      )}
                      {entry.updates && entry.updates > 1 && (
                        <span className="ml-1 text-muted-foreground">
                          ({entry.updates} updates)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {process.agents.map((agent, index) => (
            <AgentProcessRow
              agent={agent}
              key={`agent-${agent.agentId}-${agent.startedAt ?? "pending"}-${index}`}
              isReadonly={isReadonly}
            />
          ))}

          {visibleProcess.approvals.map((approval) => (
            <ApprovalProcessRow
              busy={actionStatuses[approval.id] === "updating"}
              key={`approval-${approval.id}`}
              approval={approval}
              onDecide={decideApproval}
            />
          ))}

          {visibleProcess.handoffs.map((handoff) => (
            <HandoffProcessRow
              busy={actionStatuses[handoff.id] === "updating"}
              handoff={handoff}
              key={`handoff-${handoff.id}`}
              onUpdate={updateHandoff}
            />
          ))}

          {process.aggregated && <ProcessRow done label="Response composed" />}
          {visibleProcess.status === "paused" && (
            <ProcessRow label="Waiting for human approval" />
          )}
          {visibleProcess.status === "completed" && (
            <ProcessRow done label="Completed" />
          )}
          {visibleProcess.error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              <span>{visibleProcess.error}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type ApprovalTrace = NonNullable<WorkflowTrace["approvals"]>[number];
function ApprovalProcessRow({
  approval,
  busy,
  onDecide,
}: {
  approval: ApprovalTrace;
  busy: boolean;
  onDecide: (id: string, status: "approved" | "rejected") => void;
}) {
  const pending = approval.status === "pending";
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {pending ? (
            <CircleDot className="size-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">Approval required: {approval.title}</div>
          {approval.description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {approval.description}
            </p>
          )}
          <Badge
            className="mt-2 capitalize"
            variant={pending ? "outline" : "secondary"}
          >
            {approval.status}
          </Badge>
        </div>
      </div>
      {pending && (
        <div className="flex flex-wrap gap-2 pl-6">
          <Button
            disabled={busy}
            onClick={() => onDecide(approval.id, "approved")}
            size="sm"
          >
            Approve
          </Button>
          <Button
            disabled={busy}
            onClick={() => onDecide(approval.id, "rejected")}
            size="sm"
            variant="outline"
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

type HandoffTrace = NonNullable<WorkflowTrace["handoffs"]>[number];
function HandoffProcessRow({
  handoff,
  busy,
  onUpdate,
}: {
  handoff: HandoffTrace;
  busy: boolean;
  onUpdate: (id: string, status: "accepted" | "completed" | "rejected") => void;
}) {
  const humanHandoff = Boolean(handoff.toUserId);
  const pending = handoff.status === "pending";
  const accepted = handoff.status === "accepted";
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {pending ? (
            <CircleDot className="size-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {humanHandoff ? "Human handoff" : "Agent handoff"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{handoff.task}</p>
          <Badge className="mt-2 capitalize" variant="secondary">
            {handoff.status}
          </Badge>
        </div>
      </div>
      {humanHandoff && (pending || accepted) && (
        <div className="flex flex-wrap gap-2 pl-6">
          {pending && (
            <>
              <Button
                disabled={busy}
                onClick={() => onUpdate(handoff.id, "accepted")}
                size="sm"
              >
                Accept
              </Button>
              <Button
                disabled={busy}
                onClick={() => onUpdate(handoff.id, "rejected")}
                size="sm"
                variant="outline"
              >
                Reject
              </Button>
            </>
          )}
          {accepted && (
            <Button
              disabled={busy}
              onClick={() => onUpdate(handoff.id, "completed")}
              size="sm"
            >
              Mark complete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function AgentProcessRow({
  agent,
  isReadonly,
}: {
  agent: WorkflowAgentTrace;
  isReadonly: boolean;
}) {
  const isRunning = agent.status === "running";
  const isFailed = agent.status === "failed";
  const [open, setOpen] = useState(isRunning);
  useEffect(() => {
    if (isRunning) setOpen(true);
  }, [isRunning]);
  const initials = agent.agentName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = agent.avatarUrl?.trim() || undefined;

  return (
    <Collapsible
      className="group/agent rounded-lg border bg-background/60"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        {isFailed ? (
          <XCircle className="size-4 shrink-0 text-destructive" />
        ) : isRunning ? (
          <Clock3 className="size-4 shrink-0 animate-pulse text-amber-500" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        )}
        <AgentPopover agent={agent} avatarUrl={avatarUrl} initials={initials} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {agent.task}
        </span>
        {agent.durationMs !== undefined && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatDuration(agent.durationMs)}
          </span>
        )}
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/agent:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-9 pb-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ListChecks className="size-3.5" />
          <span className="capitalize">{agent.status}</span>
          {agent.model && <span>· {agent.model}</span>}
        </div>
        {agent.output && (
          <p className="line-clamp-4 text-xs whitespace-pre-wrap text-foreground/80">
            {agent.output}
          </p>
        )}
        {agent.error && (
          <p className="text-xs text-destructive">{agent.error}</p>
        )}
        {agent.toolCalls && agent.toolCalls.length > 0 && (
          <div className="space-y-1.5 border-l pl-2.5">
            {agent.toolCalls.map((tool) => (
              <ToolCallPart
                isReadonly={isReadonly}
                key={tool.toolCallId}
                part={
                  {
                    error: tool.error,
                    input: tool.input,
                    output: tool.output,
                    state:
                      tool.status === "error"
                        ? "output-error"
                        : "output-available",
                    toolCallId: tool.toolCallId,
                    type: `tool-${tool.toolName}`,
                  } satisfies ToolPart
                }
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AgentPopover({
  agent,
  avatarUrl,
  initials,
}: {
  agent: WorkflowAgentTrace;
  avatarUrl?: string;
  initials: string;
}) {
  return (
    <PopoverRoot>
      <PopoverTriggerButton asChild>
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar className="size-5">
            {avatarUrl && <AvatarImage alt={agent.agentName} src={avatarUrl} />}
            <AvatarFallback className="text-[9px]">
              {initials || "AI"}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-28 truncate text-xs font-medium">
            {agent.agentName}
          </span>
        </span>
      </PopoverTriggerButton>
      <PopoverContentPanel>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Avatar>
              {avatarUrl && (
                <AvatarImage alt={agent.agentName} src={avatarUrl} />
              )}
              <AvatarFallback>{initials || "AI"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{agent.agentName}</div>
              <div className="text-xs text-muted-foreground">
                {agent.status}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">Model</span>
            <span className="truncate">{agent.model ?? "Default model"}</span>
            <span className="text-muted-foreground">Thinking time</span>
            <span>{formatDuration(agent.durationMs ?? 0)}</span>
            <span className="text-muted-foreground">Task</span>
            <span>{agent.task}</span>
          </div>
        </div>
      </PopoverContentPanel>
    </PopoverRoot>
  );
}

function ProcessRow({ done, label }: { done?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
      {done ? (
        <CheckCircle2 className="size-4 text-emerald-500" />
      ) : (
        <CircleDot className="size-4" />
      )}
      <span>{label}</span>
    </div>
  );
}

type BuiltProcess = {
  status: WorkflowTrace["status"];
  executionTimeMs?: number;
  classification?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  agents: WorkflowAgentTrace[];
  aggregated: boolean;
  approvals: NonNullable<WorkflowTrace["approvals"]>;
  handoffs: NonNullable<WorkflowTrace["handoffs"]>;
  error?: string;
  activity: ActivityEntry[];
};

type ActivityEntry = {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "paused" | "completed" | "error";
  updates?: number;
  kind?:
    | "agent-start"
    | "agent-progress"
    | "agent-completed"
    | "workflow-step";
  agentId?: string;
  stepId?: string;
};

function buildProcess(parts: ChatMessage["parts"]): BuiltProcess | null {
  const events = (parts as unknown as WorkflowPart[])
    .filter(
      (part) =>
        typeof part?.type === "string" &&
        (part.type.startsWith("data-workflow") ||
          part.type === "data-memoryUpdated" ||
          part.type === "data-scheduledTaskCreated" ||
          part.type.startsWith("tool-") ||
          part.type === "dynamic-tool"),
    )
    .map(
      (part) =>
        ({
          type: part.type,
          data: (part.type.startsWith("data-") ? part.data : part) as Record<
            string,
            unknown
          >,
        }) satisfies ProcessEvent,
    );

  if (events.length === 0) return null;

  const trace = events.find((event) => event.type === "data-workflowTrace")
    ?.data as WorkflowTrace | undefined;
  if (trace) {
    return {
      status: trace.status,
      executionTimeMs: trace.executionTimeMs,
      classification: trace.classification,
      plan: trace.plan,
      agents: trace.agents,
      aggregated: trace.aggregated ?? trace.status === "completed",
      approvals: trace.approvals ?? [],
      handoffs: trace.handoffs ?? [],
      error: trace.error,
      // A reloaded message contains the durable trace rather than the
      // transient lifecycle chunks. Project the same compact activity from
      // that trace so the stream and persisted conversation do not diverge.
      activity: buildActivity(traceToEvents(trace)),
    };
  }

  const agents: WorkflowAgentTrace[] = [];
  const activeAgentIndexes = new Map<string, number>();
  let status: WorkflowTrace["status"] = "running";
  let executionTimeMs: number | undefined;
  let classification: Record<string, unknown> | undefined;
  let plan: Record<string, unknown> | undefined;
  let aggregated = false;
  const approvals: NonNullable<WorkflowTrace["approvals"]> = [];
  const handoffs: NonNullable<WorkflowTrace["handoffs"]> = [];
  let error: string | undefined;
  const workflowSteps = new Map<string, ActivityEntry>();

  for (const event of events) {
    if (event.type === "data-workflowStepStarted") {
      const stepId = String(event.data.stepId ?? "");
      if (stepId) {
        workflowSteps.set(stepId, {
          id: `workflow-step-${stepId}`,
          label: `Started ${String(event.data.stepName ?? stepId)}`,
          status: "running",
          kind: "workflow-step",
          stepId,
        });
      }
    }
    if (event.type === "data-workflowStepCompleted") {
      const stepId = String(event.data.stepId ?? "");
      const current = workflowSteps.get(stepId);
      if (current) {
        workflowSteps.set(stepId, {
          ...current,
          label: `${String(event.data.stepName ?? stepId)} finished`,
          status: "completed",
          detail:
            typeof event.data.durationMs === "number"
              ? formatDuration(event.data.durationMs)
              : undefined,
        });
      }
    }
    if (event.type === "data-workflowClassification")
      classification = event.data;
    if (event.type === "data-workflowPlan") plan = event.data;
    if (event.type === "data-workflowAggregated") aggregated = true;
    if (event.type === "data-workflowPaused") status = "paused";
    if (event.type === "data-workflowCompleted") {
      status = event.data.success === false ? "failed" : "completed";
      executionTimeMs = Number(event.data.executionTimeMs ?? 0);
    }
    if (event.type === "data-workflowError") {
      status = "failed";
      error = String(event.data.error ?? "Workflow failed");
    }
    if (event.type === "data-workflowApprovalRequested") {
      status = "paused";
      approvals.push(
        event.data as NonNullable<WorkflowTrace["approvals"]>[number],
      );
    }
    if (event.type === "data-workflowHandoffCreated") {
      handoffs.push(
        event.data as NonNullable<WorkflowTrace["handoffs"]>[number],
      );
    }
    if (event.type === "data-workflowAgentStarted") {
      const agent = event.data as unknown as WorkflowAgentTrace;
      activeAgentIndexes.set(
        agent.agentId,
        agents.push({ ...agent, status: "running" }) - 1,
      );
    }
    if (event.type === "data-workflowAgentProgress") {
      const progress = event.data as {
        agentId?: unknown;
        progress?: unknown;
      };
      if (
        typeof progress.agentId === "string" &&
        typeof progress.progress === "string"
      ) {
        const agentIndex = activeAgentIndexes.get(progress.agentId);
        const agent = agentIndex === undefined ? undefined : agents[agentIndex];
        if (agent && agentIndex !== undefined) {
          agents[agentIndex] = {
            ...agent,
            output: progress.progress,
          };
        }
      }
    }
    if (event.type === "data-workflowAgentCompleted") {
      const agent = event.data as unknown as WorkflowAgentTrace;
      const agentIndex = activeAgentIndexes.get(agent.agentId);
      if (agentIndex === undefined) {
        agents.push(agent);
      } else {
        agents[agentIndex] = agent;
        activeAgentIndexes.delete(agent.agentId);
      }
    }
  }

  return {
    status,
    executionTimeMs,
    classification,
    plan,
    agents,
    aggregated,
    approvals,
    handoffs,
    error,
    activity: [...buildActivity(events), ...workflowSteps.values()],
  };
}

function traceToEvents(trace: WorkflowTrace): ProcessEvent[] {
  const events: ProcessEvent[] = [
    {
      type: "data-workflowStarted",
      data: { workflowId: trace.workflowId },
    },
  ];
  if (trace.classification) {
    events.push({
      type: "data-workflowClassification",
      data: trace.classification,
    });
  }
  if (trace.plan) {
    events.push({ type: "data-workflowPlan", data: trace.plan });
  }

  for (const agent of trace.agents) {
    events.push({
      type: "data-workflowAgentStarted",
      data: agent as unknown as Record<string, unknown>,
    });
    for (const tool of agent.toolCalls ?? []) {
      events.push({
        type: `tool-${tool.toolName}`,
        data: {
          state: tool.status === "error" ? "output-error" : "output-available",
          toolCallId: tool.toolCallId,
          input: tool.input,
          output: tool.output,
          errorText: tool.error,
        },
      });
    }
    events.push({
      type: "data-workflowAgentCompleted",
      data: agent as unknown as Record<string, unknown>,
    });
  }
  for (const approval of trace.approvals ?? []) {
    events.push({
      type: "data-workflowApprovalRequested",
      data: approval as unknown as Record<string, unknown>,
    });
  }
  for (const handoff of trace.handoffs ?? []) {
    events.push({
      type: "data-workflowHandoffCreated",
      data: handoff as unknown as Record<string, unknown>,
    });
  }
  if (trace.aggregated) {
    events.push({ type: "data-workflowAggregated", data: {} });
  }
  if (trace.status === "paused") {
    events.push({
      type: "data-workflowPaused",
      data: { workflowId: trace.workflowId },
    });
  } else if (trace.status === "failed") {
    events.push({
      type: "data-workflowError",
      data: { error: trace.error ?? "Workflow failed" },
    });
  } else if (trace.status === "completed") {
    events.push({
      type: "data-workflowCompleted",
      data: {
        success: true,
        executionTimeMs: trace.executionTimeMs,
      },
    });
  }
  return events;
}

function buildActivity(events: ProcessEvent[]): ActivityEntry[] {
  const agentNames = new Map<string, string>();
  for (const event of events) {
    if (
      event.type === "data-workflowAgentStarted" ||
      event.type === "data-workflowAgentCompleted"
    ) {
      const agentId = event.data.agentId;
      const agentName = event.data.agentName;
      if (typeof agentId === "string" && typeof agentName === "string") {
        agentNames.set(agentId, agentName);
      }
    }
  }

  const entries = events.flatMap<ActivityEntry>((event, index) => {
    const id = `${event.type}-${index}`;
    const data = event.data;
    switch (event.type) {
      case "data-workflowStarted":
        return [{ id, label: "Workflow started", status: "completed" }];
      case "data-workflowClassification":
        return [
          {
            id,
            label: "Request classified",
            detail: String(data.complexity ?? data.type ?? "request"),
            status: "completed",
          },
        ];
      case "data-workflowPlan":
        return [
          {
            id,
            label: "Execution plan prepared",
            detail: String(data.strategy ?? "direct"),
            status: "completed",
          },
        ];
      case "data-workflowAgentStarted":
        return [
          {
            id,
            label: `Started ${String(data.agentName ?? "agent")}`,
            detail: String(data.task ?? ""),
            status: "running",
            kind: "agent-start",
            agentId: String(data.agentId ?? ""),
          },
        ];
      case "data-workflowAgentProgress":
        return [
          {
            id,
            label: String(
              data.agentName ??
                agentNames.get(String(data.agentId ?? "")) ??
                "Agent",
            ),
            detail: String(data.progress ?? "Progress update"),
            status: "running",
            updates: 1,
            kind: "agent-progress",
            agentId: String(data.agentId ?? ""),
          },
        ];
      case "data-workflowAgentCompleted":
        return [
          {
            id,
            label: `${String(data.agentName ?? "Agent")} finished`,
            detail: data.error ? String(data.error) : undefined,
            status: data.status === "failed" ? "error" : "completed",
            kind: "agent-completed",
            agentId: String(data.agentId ?? ""),
          },
        ];
      case "data-workflowApprovalRequested":
        return [
          {
            id,
            label: "Human approval required",
            detail: String(data.title ?? "Critical action paused"),
            status: "paused",
          },
        ];
      case "data-workflowHandoffCreated":
        return [
          {
            id,
            label: "Agent handoff created",
            detail: String(data.task ?? ""),
            status: "running",
          },
        ];
      case "data-workflowAggregated":
        return [{ id, label: "Agent results aggregated", status: "completed" }];
      case "data-workflowPaused":
        return [{ id, label: "Workflow paused", status: "paused" }];
      case "data-workflowError":
        return [
          {
            id,
            label: "Workflow error",
            detail: String(data.error ?? "Unknown error"),
            status: "error",
          },
        ];
      case "data-workflowCompleted":
        return [
          {
            id,
            label:
              data.success === false ? "Workflow failed" : "Workflow completed",
            detail:
              data.executionTimeMs === undefined
                ? undefined
                : formatDuration(Number(data.executionTimeMs)),
            status: data.success === false ? "error" : "completed",
          },
        ];
      case "data-memoryUpdated":
        return [
          {
            id,
            label: "Memory saved",
            detail: String(data.key ?? "Personal memory updated"),
            status: "completed",
          },
        ];
      case "data-scheduledTaskCreated":
        return [
          {
            id,
            label: "Scheduled task created",
            detail: String(data.name ?? "Automation scheduled"),
            status: "completed",
          },
        ];
      default:
        if (event.type.startsWith("tool-") || event.type === "dynamic-tool") {
          const state = String(data.state ?? "input-available");
          const name =
            event.type === "dynamic-tool"
              ? "Tool"
              : event.type
                  .replace(/^tool-/, "")
                  .replace(/[-_]/g, " ")
                  .replace(/([a-z])([A-Z])/g, "$1 $2");
          const toolError =
            typeof data.errorText === "string"
              ? data.errorText
              : data.output &&
                  typeof data.output === "object" &&
                  "error" in data.output
                ? String((data.output as { error: unknown }).error)
                : undefined;
          return [
            {
              id,
              label: `Tool · ${name}`,
              detail:
                toolError ??
                (state === "output-available"
                  ? "Completed"
                  : state === "approval-requested"
                    ? "Waiting for approval"
                    : state === "output-error"
                      ? "Failed"
                      : "Running"),
              status:
                toolError || state === "output-error"
                  ? "error"
                  : state === "approval-requested"
                    ? "paused"
                    : state === "output-available" || state === "output-denied"
                      ? "completed"
                      : "running",
            },
          ];
        }
        return [];
    }
  });

  const progressEntries = new Map<string, number>();
  const coalesced: ActivityEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "agent-progress" && entry.agentId) {
      const existingIndex = progressEntries.get(entry.agentId);
      if (existingIndex !== undefined) {
        const existing = coalesced[existingIndex];
        if (existing) {
          coalesced[existingIndex] = {
            ...existing,
            detail: entry.detail,
            updates: (existing.updates ?? 1) + 1,
          };
        }
        continue;
      }
      progressEntries.set(entry.agentId, coalesced.length);
    }
    if (entry.kind === "agent-start" || entry.kind === "agent-completed") {
      if (entry.agentId) progressEntries.delete(entry.agentId);
    }
    coalesced.push(entry);
  }

  return coalesced;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}
