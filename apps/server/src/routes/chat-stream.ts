import type { RequestServices } from "@/di/di-context";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { BadRequestError, ForbiddenError } from "@circulo-ai/types";
import { createUIMessageStreamResponse } from "ai";

const router = createRouter();

router.get("/chat/:id/stream", requireAuth, async (c) => {
	const { id } = c.req.param();
	const { user } = c.var;
	const di: RequestServices = c.di;
	const organizationId =
		c.get("activeOrgId") ?? (await getActiveOrganizationId(c.req.raw));
	const accessibleRun = await di.WorkflowRunRepository.findByIdInOrganization({
		id,
		organizationId,
	});

	if (
		!accessibleRun ||
		!(await di.ChatMemberRepository.isMember(user!.id, accessibleRun.chatId))
	) {
		throw new ForbiddenError("Workflow run is not available");
	}

	const { searchParams } = new URL(c.req.url);
	const startIndexParam = searchParams.get("startIndex");
	const startIndex =
		startIndexParam !== null ? Number.parseInt(startIndexParam, 10) : undefined;

	if (
		startIndex !== undefined &&
		(!Number.isInteger(startIndex) || startIndex < 0)
	) {
		throw new BadRequestError("startIndex must be a non-negative integer");
	}

	const stream = await workflowRunService.getReadable(id, startIndex);

	return createUIMessageStreamResponse({
		stream,
		headers: {
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
});

export default router;
