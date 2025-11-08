import { agentRepo } from "@/db/repositories/agent-repo";
import { api, success } from "@/lib/server";

export const GET = api({ auth: true }, async (req, ctx) => {
  const userAgents = await agentRepo.findForUser(ctx.user.id);
  return success({ agents: userAgents });
});
