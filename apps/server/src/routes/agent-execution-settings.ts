import {
  getAgentExecutionSettings,
  saveAgentExecutionSettings,
} from "@/lib/agent-execution-settings";
import type { AppEnv } from "@/lib/create-app";
import { createRouter } from "@/lib/create-app";
import { isCloudRuntime } from "@/lib/deployment/instance-auth";
import { hasPermissionForUser, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  ForbiddenError,
  agentExecutionSettingsSchema,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";

const router = createRouter();

async function getContext(c: Context<AppEnv>) {
  const organizationId = c.get("activeOrgId");
  const userId = c.var.user!.id;
  if (!organizationId || !(await isMemberOf(userId, organizationId))) {
    throw new ForbiddenError("An active workspace membership is required");
  }
  const canManage = await hasPermissionForUser(
    userId,
    organizationId,
    "workspace",
    "manage",
    c.var.apiKeyPermissions,
  );
  return { organizationId, userId, canManage };
}

router.get("/workspace/agent-execution-settings", requireAuth, async (c) => {
  const context = await getContext(c);
  return c.json({
    config: await getAgentExecutionSettings(context.organizationId),
    canManage: context.canManage,
    usageBudgetsAvailable: !isCloudRuntime(),
  });
});

router.patch(
  "/workspace/agent-execution-settings",
  requireAuth,
  zValidator("json", agentExecutionSettingsSchema),
  async (c) => {
    const context = await getContext(c);
    if (!context.canManage) {
      throw new ForbiddenError(
        "Workspace management permission is required to change agent execution settings",
      );
    }
    const config = c.req.valid("json");
    if (
      isCloudRuntime() &&
      (config.usageBudgets.rollingFiveHourTokens !== null ||
        config.usageBudgets.rollingSevenDayTokens !== null)
    ) {
      throw new BadRequestError(
        "Workspace token budgets are available in desktop/local and self-hosted deployments",
      );
    }
    const saved = await saveAgentExecutionSettings({
      organizationId: context.organizationId,
      userId: context.userId,
      config,
    });
    return c.json({
      config: saved,
      canManage: context.canManage,
      usageBudgetsAvailable: !isCloudRuntime(),
    });
  },
);

export default router;
