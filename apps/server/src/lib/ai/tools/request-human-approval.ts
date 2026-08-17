import { db, humanApproval } from "@/db";
import { chatMemberRepo } from "@/db/repositories";
import type { ActorContext, ChatMessage } from "@/lib/types";
import type { Tool, UIMessageStreamWriter } from "ai";
import { tool } from "ai";
import { z } from "zod";

export async function createHumanApprovalRequest(params: {
	session: ActorContext;
	chatId: string;
	workflowRunId: string;
	title: string;
	description: string;
	requestedAction: Record<string, unknown>;
	approverUserId?: string;
	expiresAt?: Date;
}) {
	if (!params.session.organizationId)
		throw new Error("An organization is required for approvals");
	if (
		params.approverUserId &&
		!(await chatMemberRepo.isMember(params.approverUserId, params.chatId))
	) {
		throw new Error("The approver must be an active member of this chat");
	}
	if (params.expiresAt && params.expiresAt.getTime() <= Date.now()) {
		throw new Error("Approval expiry must be in the future");
	}
	const [approval] = await db
		.insert(humanApproval)
		.values({
			organizationId: params.session.organizationId,
			chatId: params.chatId,
			workflowRunId: params.workflowRunId,
			requestedBy: params.session.userId,
			title: params.title,
			description: params.description,
			requestedAction: params.requestedAction,
			approverUserId: params.approverUserId,
			expiresAt: params.expiresAt,
		})
		.returning();
	if (!approval) throw new Error("Unable to create approval request");
	return approval;
}

export function requestHumanApproval(params: {
	session: ActorContext;
	chatId: string;
	workflowRunId: string;
	dataStream: UIMessageStreamWriter<ChatMessage>;
}): Tool {
	return tool({
		description:
			"Request a human approval before a consequential action. Use this when an action needs explicit human authorization.",
		inputSchema: z.object({
			title: z.string().min(1).max(200),
			description: z.string().min(1).max(10000),
			requestedAction: z.record(z.string(), z.unknown()),
			approverUserId: z.string().optional(),
			expiresAt: z.string().datetime().optional(),
		}),
		execute: async (input) => {
			const approval = await createHumanApprovalRequest({
				session: params.session,
				chatId: params.chatId,
				workflowRunId: params.workflowRunId,
				title: input.title,
				description: input.description,
				requestedAction: input.requestedAction,
				approverUserId: input.approverUserId,
				expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
			});
			params.dataStream.write({
				type: "data-workflowApprovalRequested",
				data: {
					id: approval.id,
					title: approval.title,
					status: approval.status,
				},
				transient: false,
			});
			return {
				approvalId: approval.id,
				status: approval.status,
				message:
					"Approval requested. Wait for a human decision before proceeding.",
			};
		},
	});
}
