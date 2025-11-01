// Standardized usage metrics and helpers for billing/consumption
// Keep this minimal and shared across services

export type UsageMetric =
  | "chat_tokens"
  | "image_requests"
  | "embeddings_calls"
  | "assistant_calls"
  | "audio_minutes";

export type MetricRate = {
  included: number; // included free units per billing period
  unitPriceUSD?: number; // price per unit in USD
  unitPriceIRR?: number; // alternative: price per unit in IRR
  multiplier?: number; // optional multiplier for business margin/profit
};

export type PlanRatesMetadata = {
  rates: Record<UsageMetric, MetricRate>;
  overagePolicy?: "hard" | "soft"; // default: hard
  profitMultiplier?: number; // global multiplier applied if per-metric not specified
};

// Map a usage metric to an existing transaction type for ledger entries
// We restrict to existing enum values to avoid migrations.
export function metricToTransactionType(metric: UsageMetric): "chat_usage" | "embedding_usage" | "withdrawal" {
  switch (metric) {
    case "chat_tokens":
    case "image_requests":
    case "assistant_calls":
      return "chat_usage";
    case "embeddings_calls":
      return "embedding_usage";
    case "audio_minutes":
      // Not explicitly in enum; use a generic withdrawal for now
      return "withdrawal";
    default:
      return "withdrawal";
  }
}

// Utility to resolve effective unit price in USD given a rate and optional FX converter
export async function resolveUnitPriceUSD(
  rate: MetricRate,
  opts?: {
    irrToUsd?: (irrAmount: number, irrPerUsdRate: number) => number;
    fetchUsdToIrrRate?: () => Promise<{ rate: number; source: string }>;
  },
): Promise<{ unitPriceUSD: number; fxRate?: number; fxSource?: string }> {
  if (typeof rate.unitPriceUSD === "number") {
    return { unitPriceUSD: rate.unitPriceUSD };
  }
  if (typeof rate.unitPriceIRR === "number" && opts?.irrToUsd && opts?.fetchUsdToIrrRate) {
    const { rate: fxRate, source } = await opts.fetchUsdToIrrRate();
    const usd = opts.irrToUsd(rate.unitPriceIRR, fxRate);
    return { unitPriceUSD: usd, fxRate, fxSource: source };
  }
  throw new Error("No unit price configured for metric (USD or IRR)");
}