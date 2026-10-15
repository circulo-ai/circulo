import { readOpenRouterUsage } from "@/lib/ai/openrouter-client";

export function completedStepCost(
  steps: Array<{ providerMetadata?: unknown }>,
): number | undefined {
  if (!steps.length) return undefined;
  const costs = steps.map(
    (step) => readOpenRouterUsage(step.providerMetadata)?.cost,
  );
  if (costs.some((cost) => typeof cost !== "number" || !Number.isFinite(cost)))
    return undefined;
  return costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);
}
