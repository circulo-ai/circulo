import { z } from "zod";

/**
 * Fetches the USD→IRR exchange rate from exchangerate.host with env fallback.
 * Returns IRR per 1 USD.
 */
export async function fetchUsdToIrrRate(): Promise<{
  rate: number;
  source: string;
}> {
  // Primary: exchangerate.host (no key required)
  try {
    const res = await fetch(
      "https://api.exchangerate.host/latest?base=USD&symbols=IRR",
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`rate_http_${res.status}`);
    const json = await res.json();
    const schema = z.object({ rates: z.object({ IRR: z.number() }) });
    const parsed = schema.parse(json);
    const rate = parsed.rates.IRR;
    if (!rate || rate <= 0) throw new Error("rate_invalid");
    return { rate, source: "exchangerate.host" };
  } catch (err) {
    // Fallback: FX_USD_IRR_RATE env var
    const fallback = process.env.FX_USD_IRR_RATE;
    const rate = fallback ? Number(fallback) : NaN;
    if (!rate || Number.isNaN(rate) || rate <= 0) {
      throw new Error(
        `Failed to fetch USD→IRR rate and no valid fallback provided: ${String(
          err instanceof Error ? err.message : err,
        )}`,
      );
    }
    return { rate, source: "env.FX_USD_IRR_RATE" };
  }
}

/** Converts IRR amount to USD amount using IRR per USD rate. */
export function irrToUsd(irrAmount: number, irrPerUsdRate: number): number {
  if (irrPerUsdRate <= 0) throw new Error("Invalid IRR per USD rate");
  const usd = irrAmount / irrPerUsdRate;
  return Number(usd.toFixed(2)); // wallet uses 2 decimal places
}

/** Returns an expiry Date for the FX rate TTL window. Default 30 minutes. */
export function fxExpiry(ttlMinutes = 30): Date {
  const now = Date.now();
  return new Date(now + ttlMinutes * 60_000);
}

/** Utility to check if a given expiry has passed. */
export function isExpired(expiry: Date | string | null | undefined): boolean {
  if (!expiry) return true;
  const exp = typeof expiry === "string" ? new Date(expiry) : expiry;
  return Date.now() > exp.getTime();
}
