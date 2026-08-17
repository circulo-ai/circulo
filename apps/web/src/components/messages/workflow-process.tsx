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
	Wrench,
	XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type WorkflowPart = {
	type: string;
	data?: unknown;
};

type ProcessEvent = {
	type: string;
	data: Record<string, unknown>;
};

export function WorkflowProcess({ parts }: { parts: ChatMessage["parts"] }) {
	const process = useMemo(() => buildProcess(parts), [parts]);
	const [actionStatuses, setActionStatuses] = useState<Record<string, string>>(
		{},
	);
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
			defaultOpen={
				visibleProcess.status === "running" ||
				visibleProcess.status === "paused"
			}
		>
			<CollapsibleTrigger asChild nativeButton>
				<button
					className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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

					{process.agents.map((agent) => (
						<AgentProcessRow agent={agent} key={agent.agentId} />
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

function AgentProcessRow({ agent }: { agent: WorkflowAgentTrace }) {
	const isRunning = agent.status === "running";
	const isFailed = agent.status === "failed";
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
			defaultOpen={isRunning}
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
							<div
								className="rounded-md bg-muted/60 px-2 py-1.5 text-xs"
								key={tool.toolCallId}
							>
								<div className="flex items-center gap-1.5 font-medium">
									<Wrench className="size-3" />
									{tool.toolName}
									{tool.status === "error" ? (
										<XCircle className="size-3 text-destructive" />
									) : (
										<CheckCircle2 className="size-3 text-emerald-500" />
									)}
								</div>
								{tool.error && (
									<div className="mt-1 text-destructive">{tool.error}</div>
								)}
							</div>
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
};

function buildProcess(parts: ChatMessage["parts"]): BuiltProcess | null {
	const events = (parts as unknown as WorkflowPart[])
		.filter(
			(part) =>
				typeof part?.type === "string" && part.type.startsWith("data-workflow"),
		)
		.map(
			(part) =>
				({
					type: part.type,
					data: (part.data ?? {}) as Record<string, unknown>,
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
		};
	}

	const agents = new Map<string, WorkflowAgentTrace>();
	let status: WorkflowTrace["status"] = "running";
	let executionTimeMs: number | undefined;
	let classification: Record<string, unknown> | undefined;
	let plan: Record<string, unknown> | undefined;
	let aggregated = false;
	const approvals: NonNullable<WorkflowTrace["approvals"]> = [];
	const handoffs: NonNullable<WorkflowTrace["handoffs"]> = [];
	let error: string | undefined;

	for (const event of events) {
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
			agents.set(agent.agentId, { ...agent, status: "running" });
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
				const agent = agents.get(progress.agentId);
				if (agent) {
					agents.set(agent.agentId, {
						...agent,
						output: progress.progress,
					});
				}
			}
		}
		if (event.type === "data-workflowAgentCompleted") {
			const agent = event.data as unknown as WorkflowAgentTrace;
			agents.set(agent.agentId, agent);
		}
	}

	return {
		status,
		executionTimeMs,
		classification,
		plan,
		agents: [...agents.values()],
		aggregated,
		approvals,
		handoffs,
		error,
	};
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))} ms`;
	return `${(durationMs / 1000).toFixed(1)} s`;
}
