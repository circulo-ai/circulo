import { db, humanApproval, message, scheduledTask, workflowRun } from "@/db";
import { chatMemberRepo } from "@/db/repositories";
import { calculateNextRun } from "@/services/scheduling";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { and, eq, lte } from "drizzle-orm";

const SCHEDULER_KEY = Symbol.for("circulo.scheduler");
const schedulerState = globalThis as unknown as {
	[SCHEDULER_KEY]?: ReturnType<typeof setInterval>;
};
let databaseRetryAt = 0;

async function runTask(task: typeof scheduledTask.$inferSelect) {
	const now = new Date();
	if (
		!task.chatId ||
		!(await chatMemberRepo.isMember(task.createdBy, task.chatId))
	) {
		await db
			.update(scheduledTask)
			.set({
				status: "paused",
				metadata: {
					...task.metadata,
					pausedReason: "The associated chat is unavailable to the task owner.",
				},
				updatedAt: now,
			})
			.where(eq(scheduledTask.id, task.id));
		return;
	}
	const next = calculateNextRun(task, now);
	const [claimed] = await db
		.update(scheduledTask)
		.set({
			lastRunAt: now,
			nextRunAt: next,
			status: next ? "active" : "completed",
			updatedAt: now,
		})
		.where(
			and(
				eq(scheduledTask.id, task.id),
				eq(scheduledTask.status, "active"),
				eq(scheduledTask.chatId, task.chatId),
				lte(scheduledTask.nextRunAt, now),
			),
		)
		.returning();
	if (!claimed) return;

	const messageId = crypto.randomUUID();
	await db.insert(message).values({
		id: messageId,
		chatId: task.chatId!,
		authorType: "user",
		authorId: task.createdBy,
		role: "user",
		content: task.prompt,
		parts: [{ type: "text", text: task.prompt }],
		attachments: [],
	});

	const run = await workflowRunService.start({
		chatId: task.chatId!,
		messages: [
			{
				id: messageId,
				role: "user",
				parts: [{ type: "text", text: task.prompt }],
			},
		],
		triggerType: "user_message",
		actor: { userId: task.createdBy, organizationId: task.organizationId },
	});
	await db.insert(workflowRun).values({
		id: run.runId,
		chatId: task.chatId!,
		userId: task.createdBy,
		organizationId: task.organizationId,
	});
	void workflowRunService.run(run.runId).catch((error: unknown) => {
		console.error("[Scheduler] workflow failed", { runId: run.runId, error });
	});
}

async function tick() {
	if (Date.now() < databaseRetryAt) return;

	let due: (typeof scheduledTask.$inferSelect)[];
	try {
		await expirePendingApprovals();
		due = await db.query.scheduledTask.findMany({
			where: and(
				eq(scheduledTask.status, "active"),
				lte(scheduledTask.nextRunAt, new Date()),
			),
			limit: 20,
		});
		databaseRetryAt = 0;
	} catch (error) {
		databaseRetryAt = Date.now() + 30_000;
		console.error(
			"[Scheduler] database unavailable; retrying in 30 seconds",
			error instanceof Error ? error.message : String(error),
		);
		return;
	}
	for (const task of due) {
		if (!task.chatId) continue;
		await runTask(task).catch(async (error) => {
			console.error("[Scheduler] task failed", { taskId: task.id, error });
			await db
				.update(scheduledTask)
				.set({ status: "failed", updatedAt: new Date() })
				.where(eq(scheduledTask.id, task.id));
		});
	}
}

async function expirePendingApprovals(): Promise<void> {
	const now = new Date();
	const expired = await db
		.update(humanApproval)
		.set({ status: "expired", decidedAt: now })
		.where(
			and(
				eq(humanApproval.status, "pending"),
				lte(humanApproval.expiresAt, now),
			),
		)
		.returning({ workflowRunId: humanApproval.workflowRunId });

	await Promise.all(
		expired
			.map((approval) => approval.workflowRunId)
			.filter((workflowRunId): workflowRunId is string =>
				Boolean(workflowRunId),
			)
			.map((workflowRunId) =>
				workflowRunService.resume(workflowRunId).catch((error: unknown) => {
					console.error("[Scheduler] failed to resume expired approval", {
						workflowRunId,
						error,
					});
				}),
			),
	);
}

export function startScheduler() {
	if (schedulerState[SCHEDULER_KEY]) return;
	void tick().catch((error) =>
		console.error("[Scheduler] initial tick failed", error),
	);
	schedulerState[SCHEDULER_KEY] = setInterval(() => {
		void tick().catch((error) =>
			console.error("[Scheduler] tick failed", error),
		);
	}, 15_000);
}
