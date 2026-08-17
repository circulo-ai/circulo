"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { authClient } from "@/lib/auth-client";
import {
	Bell,
	CalendarClock,
	Clock3,
	Pause,
	Pencil,
	Play,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

type Repeat = "once" | "daily" | "weekdays" | "weekly" | "interval" | "cron";
type NotificationMode = "important_updates" | "all_activity" | "none";
type Task = {
	id: string;
	name: string;
	chatId: string | null;
	prompt: string;
	scheduleType: "once" | "interval" | "cron";
	schedule: string;
	status: string;
	nextRunAt: string | null;
	metadata?: Record<string, unknown>;
};
type Approval = { id: string; title: string; description: string };
type Handoff = { id: string; task: string; status: string };
type Conversation = { id: string; title?: string | null; name?: string | null };
type TaskForm = {
	chatId: string;
	name: string;
	prompt: string;
	repeat: Repeat;
	schedule: string;
	at: string;
	dayOfWeek: string;
	intervalSeconds: string;
	notificationMode: NotificationMode;
};

const suggestions = [
	{
		id: "daily-brief",
		name: "Daily brief",
		detail: "Weekdays at 8:00 AM",
		prompt:
			"Start each weekday with a summary of my calendar, unread email, and priorities.",
		repeat: "weekdays" as Repeat,
		schedule: "0 8 * * 1-5",
		at: "08:00",
		icon: Bell,
	},
	{
		id: "weekly-review",
		name: "Weekly review",
		detail: "Fridays at 4:00 PM",
		prompt: "Turn my recent work into a concise status update every Friday.",
		repeat: "weekly" as Repeat,
		schedule: "0 16 * * 5",
		at: "16:00",
		icon: CalendarClock,
	},
	{
		id: "follow-up-monitor",
		name: "Follow-up monitor",
		detail: "Weekdays at 9:00 AM",
		prompt:
			"Review recent email and calendar activity and flag anything that needs my attention.",
		repeat: "weekdays" as Repeat,
		schedule: "0 9 * * 1-5",
		at: "09:00",
		icon: Clock3,
	},
];

const emptyForm: TaskForm = {
	chatId: "",
	name: "",
	prompt: "",
	repeat: "daily",
	schedule: "0 9 * * *",
	at: "09:00",
	dayOfWeek: "5",
	intervalSeconds: "3600",
	notificationMode: "important_updates",
};
const taskSchema = z.object({
	chatId: z
		.string()
		.trim()
		.min(1, "Choose the chat this task should post into."),
	name: z
		.string()
		.trim()
		.min(1, "Add a title for this scheduled task.")
		.max(200),
	prompt: z
		.string()
		.trim()
		.min(1, "Describe what the task should do.")
		.max(20_000),
	repeat: z.enum(["once", "daily", "weekdays", "weekly", "interval", "cron"]),
	schedule: z.string().trim().min(1, "Choose when this task should run."),
	at: z.string(),
	dayOfWeek: z.string(),
	intervalSeconds: z.string(),
	notificationMode: z.enum(["important_updates", "all_activity", "none"]),
});

const fetcher = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error("Unable to load scheduled task data");
	return response.json();
};
async function request(url: string, init?: RequestInit) {
	const response = await fetch(url, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			message?: string;
			error?: string;
		} | null;
		throw new Error(payload?.message ?? payload?.error ?? "Request failed");
	}
	return response.json();
}
function scheduleFor(form: TaskForm) {
	if (form.repeat === "once")
		return {
			scheduleType: "once" as const,
			schedule: new Date(form.schedule).toISOString(),
		};
	if (form.repeat === "interval")
		return {
			scheduleType: "interval" as const,
			schedule: form.intervalSeconds,
		};
	if (form.repeat === "cron")
		return { scheduleType: "cron" as const, schedule: form.schedule };
	const [hour, minute] = form.at.split(":").map(Number);
	const day =
		form.repeat === "daily"
			? "*"
			: form.repeat === "weekly"
				? form.dayOfWeek
				: "1-5";
	return {
		scheduleType: "cron" as const,
		schedule: `${minute} ${hour} * * ${day}`,
	};
}
function formFromTask(item: Task): TaskForm {
	const metadata = item.metadata ?? {};
	const repeat = String(
		metadata.repeat ??
			(item.scheduleType === "interval" ? "interval" : item.scheduleType),
	);
	return {
		...emptyForm,
		chatId: item.chatId ?? "",
		name: item.name,
		prompt: item.prompt,
		repeat: repeat as Repeat,
		schedule: item.schedule,
		at: String(metadata.at ?? "09:00"),
		dayOfWeek: String(metadata.dayOfWeek ?? "5"),
		intervalSeconds: item.scheduleType === "interval" ? item.schedule : "3600",
		notificationMode:
			(metadata.notificationMode as NotificationMode) ?? "important_updates",
	};
}
function taskSchedule(item: Task) {
	return item.nextRunAt
		? `Next ${new Date(item.nextRunAt).toLocaleString()}`
		: item.scheduleType === "interval"
			? `Every ${item.schedule} seconds`
			: item.schedule;
}

export default function AutomationPage() {
	const { data: organization } = authClient.useActiveOrganization();
	const organizationId = organization?.id;
	const { data: tasks, mutate: mutateTasks } = useSWR<Task[]>(
		organizationId ? "/api/automation/tasks" : null,
		fetcher,
	);
	const { data: approvals, mutate: mutateApprovals } = useSWR<Approval[]>(
		organizationId ? "/api/automation/approvals" : null,
		fetcher,
	);
	const { data: handoffs, mutate: mutateHandoffs } = useSWR<Handoff[]>(
		organizationId ? "/api/automation/handoffs" : null,
		fetcher,
	);
	const { data: conversationData } = useSWR<{ conversations?: Conversation[] }>(
		"/api/conversations?limit=50",
		fetcher,
	);
	const conversations = conversationData?.conversations ?? [];
	const [search, setSearch] = useState("");
	const [form, setForm] = useState<TaskForm>(emptyForm);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [handoffNotes, setHandoffNotes] = useState<Record<string, string>>({});
	const filteredTasks = useMemo(
		() =>
			(tasks ?? []).filter((task) =>
				`${task.name} ${task.prompt}`
					.toLowerCase()
					.includes(search.toLowerCase()),
			),
		[tasks, search],
	);

	const openNew = (preset?: (typeof suggestions)[number]) => {
		setEditingId(null);
		setErrors({});
		setForm(
			preset
				? {
						...emptyForm,
						name: preset.name,
						prompt: preset.prompt,
						repeat: preset.repeat,
						schedule: preset.schedule,
						at: preset.at,
					}
				: emptyForm,
		);
	};
	const openEdit = (task: Task) => {
		setEditingId(task.id);
		setErrors({});
		setForm(formFromTask(task));
	};
	const closeEditor = () => {
		setEditingId(null);
		setErrors({});
		setForm(emptyForm);
	};

	const saveTask = async () => {
		if (!organizationId) return;
		const parsed = taskSchema.safeParse(form);
		if (!parsed.success) {
			setErrors(
				Object.fromEntries(
					parsed.error.issues.map((issue) => [
						String(issue.path[0]),
						issue.message,
					]),
				),
			);
			return;
		}
		let schedule;
		try {
			schedule = scheduleFor(form);
		} catch {
			setErrors({ schedule: "Enter a valid future date and time." });
			return;
		}
		setErrors({});
		setSaving(true);
		try {
			const body = {
				chatId: parsed.data.chatId,
				name: parsed.data.name,
				prompt: parsed.data.prompt,
				...schedule,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				metadata: {
					repeat: parsed.data.repeat,
					at: parsed.data.at,
					dayOfWeek: parsed.data.dayOfWeek,
					notificationMode: parsed.data.notificationMode,
					runsIn: "existing_chat",
					executionTarget: "workspace_scheduler",
				},
			};
			await request(
				editingId
					? `/api/automation/tasks/${editingId}`
					: "/api/automation/tasks",
				{
					method: editingId ? "PATCH" : "POST",
					body: JSON.stringify(editingId ? body : { ...body, organizationId }),
				},
			);
			await mutateTasks();
			toast.success(
				editingId ? "Scheduled task updated" : "Scheduled task created",
			);
			closeEditor();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to save scheduled task",
			);
		} finally {
			setSaving(false);
		}
	};
	const updateStatus = async (task: Task) => {
		try {
			await request(`/api/automation/tasks/${task.id}`, {
				method: "PATCH",
				body: JSON.stringify({
					status: task.status === "paused" ? "active" : "paused",
				}),
			});
			await mutateTasks();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to update scheduled task",
			);
		}
	};
	const deleteTask = async (id: string) => {
		try {
			await request(`/api/automation/tasks/${id}`, { method: "DELETE" });
			await mutateTasks();
			if (editingId === id) closeEditor();
			toast.success("Scheduled task deleted");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to delete scheduled task",
			);
		}
	};
	const decideApproval = async (
		id: string,
		status: "approved" | "rejected",
	) => {
		try {
			await request(`/api/automation/approvals/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ status }),
			});
			await mutateApprovals();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to decide approval",
			);
		}
	};
	const updateHandoff = async (
		id: string,
		status: "accepted" | "completed" | "rejected",
	) => {
		try {
			await request(`/api/automation/handoffs/${id}`, {
				method: "PATCH",
				body: JSON.stringify({
					status,
					...(status === "completed"
						? { completionNote: handoffNotes[id] }
						: {}),
				}),
			});
			await mutateHandoffs();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update handoff",
			);
		}
	};

	return (
		<WorkspaceShell
			activeSection="automation"
			actions={
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button>
							<Plus data-icon="inline-start" />
							Create
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => openNew()}>
							New scheduled task
						</DropdownMenuItem>
						{suggestions.map((suggestion) => (
							<DropdownMenuItem
								key={suggestion.id}
								onClick={() => openNew(suggestion)}
							>
								Use “{suggestion.name}”
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			}
			description="Ask Circulo to schedule tasks, set reminders, or monitor for updates."
			title="Scheduled tasks"
		>
			<div className="flex flex-col gap-8">
				<section className="overflow-hidden rounded-2xl border bg-card">
					<div className="grid min-h-[560px] lg:grid-cols-[280px_minmax(0,1fr)]">
						<aside className="border-b bg-muted/20 lg:border-r lg:border-b-0">
							<div className="flex flex-col gap-4 p-4">
								<div className="flex items-center justify-between">
									<h2 className="font-medium">Scheduled tasks</h2>
									<Button
										aria-label="Create scheduled task"
										onClick={() => openNew()}
										size="icon"
										variant="ghost"
									>
										<Plus data-icon="inline-start" />
									</Button>
								</div>
								<div className="relative">
									<Search
										className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
										data-icon="inline-start"
									/>
									<Input
										aria-label="Search scheduled tasks"
										className="pl-9"
										onChange={(event) => setSearch(event.target.value)}
										placeholder="Search scheduled tasks"
										value={search}
									/>
								</div>
							</div>
							<div className="flex flex-col gap-1 px-2 pb-4">
								<p className="px-2 pb-2 text-sm font-medium text-muted-foreground">
									Suggestions
								</p>
								{suggestions.map((suggestion) => {
									const Icon = suggestion.icon;
									return (
										<button
											className="flex items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent"
											key={suggestion.id}
											onClick={() => openNew(suggestion)}
											type="button"
										>
											<Icon
												className="mt-0.5 shrink-0 text-primary"
												data-icon="inline-start"
											/>
											<span className="min-w-0">
												<span className="flex flex-wrap gap-x-2 text-sm font-medium">
													<span>{suggestion.name}</span>
													<span className="font-normal text-muted-foreground">
														{suggestion.detail}
													</span>
												</span>
												<span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
													{suggestion.prompt}
												</span>
											</span>
										</button>
									);
								})}
								{filteredTasks.map((task) => (
									<button
										className="flex items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent"
										key={task.id}
										onClick={() => openEdit(task)}
										type="button"
									>
										<CalendarClock
											className="mt-0.5 shrink-0 text-primary"
											data-icon="inline-start"
										/>
										<span className="min-w-0">
											<span className="block truncate text-sm font-medium">
												{task.name}
											</span>
											<span className="mt-1 block text-xs text-muted-foreground">
												{task.status} · {taskSchedule(task)}
											</span>
										</span>
									</button>
								))}
							</div>
						</aside>
						<div className="flex min-w-0 flex-col">
							{!editingId && !form.name ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
									<CalendarClock
										className="text-muted-foreground"
										data-icon="inline-start"
									/>
									<h2 className="text-lg font-medium">
										Create a scheduled task
									</h2>
									<p className="max-w-md text-sm text-muted-foreground">
										Choose a suggestion or create a task to run work in an
										existing chat. Critical actions still pause for human
										approval.
									</p>
									<Button onClick={() => openNew()}>
										<Plus data-icon="inline-start" />
										New task
									</Button>
								</div>
							) : (
								<TaskEditor
									conversations={conversations}
									editing={Boolean(editingId)}
									errors={errors}
									form={form}
									saving={saving}
									setForm={setForm}
									close={closeEditor}
									save={() => void saveTask()}
								/>
							)}
						</div>
					</div>
				</section>
				{tasks && tasks.length > 0 && (
					<section className="flex flex-col gap-3">
						<div>
							<h2 className="text-lg font-medium">Your tasks</h2>
							<p className="text-sm text-muted-foreground">
								Pause, edit, or remove scheduled work at any time.
							</p>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							{tasks.map((task) => (
								<div
									className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
									key={task.id}
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<CalendarClock data-icon="inline-start" />
											<span className="truncate font-medium">{task.name}</span>
										</div>
										<p className="mt-1 text-xs text-muted-foreground">
											{task.status} · {taskSchedule(task)}
										</p>
										<p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
											{task.prompt}
										</p>
									</div>
									<div className="flex shrink-0 gap-1">
										<Button
											aria-label={`Edit ${task.name}`}
											onClick={() => openEdit(task)}
											size="icon"
											variant="ghost"
										>
											<Pencil data-icon="inline-start" />
										</Button>
										{(task.status === "active" || task.status === "paused") && (
											<Button
												aria-label={`${task.status === "paused" ? "Resume" : "Pause"} ${task.name}`}
												onClick={() => void updateStatus(task)}
												size="icon"
												variant="ghost"
											>
												{task.status === "paused" ? (
													<Play data-icon="inline-start" />
												) : (
													<Pause data-icon="inline-start" />
												)}
											</Button>
										)}
										<Button
											aria-label={`Delete ${task.name}`}
											onClick={() => void deleteTask(task.id)}
											size="icon"
											variant="ghost"
										>
											<Trash2 data-icon="inline-start" />
										</Button>
									</div>
								</div>
							))}
						</div>
					</section>
				)}
				<div className="grid gap-6 lg:grid-cols-2">
					<Attention title="Human approvals" empty="No pending approvals.">
						{(approvals ?? []).map((approval) => (
							<div
								className="flex flex-col gap-3 rounded-xl border p-4"
								key={approval.id}
							>
								<div>
									<p className="font-medium">{approval.title}</p>
									<p className="mt-1 text-sm text-muted-foreground">
										{approval.description}
									</p>
								</div>
								<div className="flex gap-2">
									<Button
										onClick={() => void decideApproval(approval.id, "approved")}
										size="sm"
									>
										Approve
									</Button>
									<Button
										onClick={() => void decideApproval(approval.id, "rejected")}
										size="sm"
										variant="outline"
									>
										Reject
									</Button>
								</div>
							</div>
						))}
					</Attention>
					<Attention title="Task handoffs" empty="No pending handoffs.">
						{(handoffs ?? []).map((handoff) => (
							<div
								className="flex flex-col gap-3 rounded-xl border p-4"
								key={handoff.id}
							>
								<div>
									<p className="font-medium">{handoff.status}</p>
									<p className="mt-1 text-sm text-muted-foreground">
										{handoff.task}
									</p>
								</div>
								{handoff.status === "pending" && (
									<div className="flex gap-2">
										<Button
											onClick={() => void updateHandoff(handoff.id, "accepted")}
											size="sm"
										>
											Accept
										</Button>
										<Button
											onClick={() => void updateHandoff(handoff.id, "rejected")}
											size="sm"
											variant="outline"
										>
											Reject
										</Button>
									</div>
								)}
								{handoff.status === "accepted" && (
									<div className="flex gap-2">
										<Input
											aria-label="Handoff completion note"
											onChange={(event) =>
												setHandoffNotes((current) => ({
													...current,
													[handoff.id]: event.target.value,
												}))
											}
											placeholder="Completion note"
											value={handoffNotes[handoff.id] ?? ""}
										/>
										<Button
											onClick={() =>
												void updateHandoff(handoff.id, "completed")
											}
											size="sm"
										>
											Complete
										</Button>
									</div>
								)}
							</div>
						))}
					</Attention>
				</div>
			</div>
		</WorkspaceShell>
	);
}

function TaskEditor({
	conversations,
	editing,
	errors,
	form,
	saving,
	setForm,
	close,
	save,
}: {
	conversations: Conversation[];
	editing: boolean;
	errors: Record<string, string>;
	form: TaskForm;
	saving: boolean;
	setForm: Dispatch<SetStateAction<TaskForm>>;
	close: () => void;
	save: () => void;
}) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex items-center justify-between gap-3 border-b px-5 py-4">
				<div>
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{editing ? "Edit" : "New"}
					</p>
					<h2 className="mt-1 text-lg font-medium">Scheduled task</h2>
				</div>
				<Button
					aria-label="Close scheduled task editor"
					onClick={close}
					size="icon"
					variant="ghost"
				>
					<X data-icon="inline-start" />
				</Button>
			</div>
			<div className="flex-1 overflow-y-auto p-5">
				<FieldGroup>
					<Field data-invalid={Boolean(errors.name)}>
						<FieldLabel htmlFor="scheduled-task-name">
							Scheduled task title
						</FieldLabel>
						<Input
							aria-invalid={Boolean(errors.name)}
							id="scheduled-task-name"
							onChange={(event) =>
								setForm((current) => ({ ...current, name: event.target.value }))
							}
							placeholder="Give this task a clear title"
							value={form.name}
						/>
						{errors.name && <FieldError>{errors.name}</FieldError>}
					</Field>
					<Field data-invalid={Boolean(errors.prompt)}>
						<FieldLabel htmlFor="scheduled-task-prompt">
							What should Circulo do?
						</FieldLabel>
						<Textarea
							aria-invalid={Boolean(errors.prompt)}
							id="scheduled-task-prompt"
							onChange={(event) =>
								setForm((current) => ({
									...current,
									prompt: event.target.value,
								}))
							}
							placeholder="Describe what Circulo should do"
							value={form.prompt}
						/>
						{errors.prompt && <FieldError>{errors.prompt}</FieldError>}
					</Field>
					<ScheduleSection title="Details">
						<ScheduleRow
							description="The workspace scheduler keeps this task running even when you are away."
							label="Runs on"
						>
							<Select defaultValue="workspace">
								<SelectTrigger disabled>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="workspace">
											Workspace scheduler
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</ScheduleRow>
						<ScheduleRow
							description="Messages and results are posted to the selected chat."
							label="Runs in"
						>
							<Select defaultValue="existing">
								<SelectTrigger disabled>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="existing">Existing chat</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</ScheduleRow>
						<ScheduleRow label="Chat">
							<Select
								onValueChange={(value) =>
									setForm((current) => ({ ...current, chatId: value ?? "" }))
								}
								value={form.chatId || undefined}
							>
								<SelectTrigger aria-invalid={Boolean(errors.chatId)}>
									<SelectValue placeholder="Choose a chat" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{conversations.map((conversation) => (
											<SelectItem key={conversation.id} value={conversation.id}>
												{conversation.title ??
													conversation.name ??
													conversation.id}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							{errors.chatId && <FieldError>{errors.chatId}</FieldError>}
						</ScheduleRow>
					</ScheduleSection>
					<ScheduleSection title="Frequency">
						<ScheduleRow label="Repeat">
							<Select
								onValueChange={(value) =>
									setForm((current) => ({
										...current,
										repeat: value as Repeat,
										schedule: value === "once" ? "" : current.schedule,
									}))
								}
								value={form.repeat}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="once">One time</SelectItem>
										<SelectItem value="daily">Daily</SelectItem>
										<SelectItem value="weekdays">Weekdays</SelectItem>
										<SelectItem value="weekly">Weekly</SelectItem>
										<SelectItem value="interval">Every interval</SelectItem>
										<SelectItem value="cron">Custom cron</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</ScheduleRow>
						{form.repeat === "once" && (
							<ScheduleRow label="At">
								<Input
									aria-invalid={Boolean(errors.schedule)}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											schedule: event.target.value,
										}))
									}
									type="datetime-local"
									value={form.schedule}
								/>
								{errors.schedule && <FieldError>{errors.schedule}</FieldError>}
							</ScheduleRow>
						)}
						{form.repeat === "interval" && (
							<ScheduleRow label="Every">
								<Input
									min={10}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											intervalSeconds: event.target.value,
										}))
									}
									type="number"
									value={form.intervalSeconds}
								/>
								<FieldDescription>
									Minimum interval: 10 seconds.
								</FieldDescription>
							</ScheduleRow>
						)}
						{form.repeat === "cron" && (
							<ScheduleRow label="Cron">
								<Input
									aria-invalid={Boolean(errors.schedule)}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											schedule: event.target.value,
										}))
									}
									placeholder="*/15 * * * *"
									value={form.schedule}
								/>
								{errors.schedule && <FieldError>{errors.schedule}</FieldError>}
							</ScheduleRow>
						)}
						{["daily", "weekdays", "weekly"].includes(form.repeat) && (
							<>
								<ScheduleRow label="At">
									<Input
										onChange={(event) =>
											setForm((current) => ({
												...current,
												at: event.target.value,
											}))
										}
										type="time"
										value={form.at}
									/>
								</ScheduleRow>
								{form.repeat === "weekly" && (
									<ScheduleRow label="On">
										<Select
											onValueChange={(value) =>
												setForm((current) => ({
													...current,
													dayOfWeek: value ?? "",
												}))
											}
											value={form.dayOfWeek}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{[
														["1", "Monday"],
														["2", "Tuesday"],
														["3", "Wednesday"],
														["4", "Thursday"],
														["5", "Friday"],
														["6", "Saturday"],
														["0", "Sunday"],
													].map(([value, label]) => (
														<SelectItem key={value} value={value}>
															{label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</ScheduleRow>
								)}
							</>
						)}
					</ScheduleSection>
					<ScheduleSection title="Notifications">
						<ScheduleRow
							description="Choose how much task activity should be surfaced."
							label="Notifications"
						>
							<Select
								onValueChange={(value) =>
									setForm((current) => ({
										...current,
										notificationMode: value as NotificationMode,
									}))
								}
								value={form.notificationMode}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="important_updates">
											Important updates
										</SelectItem>
										<SelectItem value="all_activity">All activity</SelectItem>
										<SelectItem value="none">No notifications</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</ScheduleRow>
					</ScheduleSection>
				</FieldGroup>
			</div>
			<div className="flex justify-end gap-2 border-t px-5 py-4">
				<Button onClick={close} variant="ghost">
					Cancel
				</Button>
				<Button disabled={saving} onClick={save}>
					{saving ? "Saving…" : editing ? "Save changes" : "Create"}
				</Button>
			</div>
		</div>
	);
}

function ScheduleSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="rounded-xl border">
			<h3 className="px-4 pt-4 text-sm font-medium">{title}</h3>
			<div className="mt-2 divide-y">{children}</div>
		</section>
	);
}
function ScheduleRow({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0">
				<FieldTitle>{label}</FieldTitle>
				{description && <FieldDescription>{description}</FieldDescription>}
			</div>
			<div className="w-full sm:max-w-[280px]">{children}</div>
		</div>
	);
}
function Attention({
	title,
	empty,
	children,
}: {
	title: string;
	empty: string;
	children: ReactNode;
}) {
	const hasItems = Array.isArray(children)
		? children.length > 0
		: Boolean(children);
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="text-lg font-medium">{title}</h2>
				<p className="text-sm text-muted-foreground">
					Review cooperative work that needs a human decision.
				</p>
			</div>
			{hasItems ? (
				<div className="flex flex-col gap-3">{children}</div>
			) : (
				<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
					{empty}
				</p>
			)}
		</section>
	);
}
