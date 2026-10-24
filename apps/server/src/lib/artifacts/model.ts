import type { AgentExecutionMeteringContext } from "@/lib/ai/agent-execution-meter";
import { withAgentExecutionMetering } from "@/lib/ai/agent-execution-meter";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import type { ActorContext } from "@/lib/types";

export async function resolveArtifactModel(params: {
  session: ActorContext;
  metering?: AgentExecutionMeteringContext;
}) {
  const model = await resolveLanguageModel({
    userId: params.session.userId,
    providerId: params.session.providerId,
    modelId: params.session.modelId,
  });
  if (!params.metering) return model;
  if (!params.session.modelId) {
    throw new Error("An AI model is required to generate this document");
  }
  return withAgentExecutionMetering(
    model,
    params.metering,
    params.session.providerId ?? "openrouter",
    params.session.modelId,
  );
}
