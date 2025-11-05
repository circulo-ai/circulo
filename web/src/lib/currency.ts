export type FxRate = {
  provider: string
  rateTomanPerUsd: number
  fetchedAt: Date
}

// Fetch USD→Toman via Nobitex market stats using USDT→RLS latest price.
// Nobitex returns prices in Rials (RLS). 1 Toman = 10 Rials.
// We assume USDT≈USD for quoting; use stats["usdt-rls"].latest and divide by 10.
export async function fetchUsdToTomanRate(): Promise<FxRate> {
  const url = 'https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls'
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Nobitex FX API error ${res.status}: ${text}`)
  }
  const data = await res.json()
  const key = 'usdt-rls'
  const latestStr: string | undefined = data?.stats?.[key]?.latest
  if (!latestStr) throw new Error('Nobitex response missing usdt-rls.latest')
  const latestRialPerUsdt = Number(latestStr)
  if (!latestRialPerUsdt || !isFinite(latestRialPerUsdt)) {
    throw new Error('Invalid Nobitex latest price for usdt-rls')
  }
  const rateTomanPerUsd = latestRialPerUsdt / 10
  const provider = 'nobitex'
  const fetchedAt = new Date()
  return { provider, rateTomanPerUsd, fetchedAt }
}

export function usdCentsToTomans(usdCents: number, rateTomanPerUsd: number): number {
  const usd = usdCents / 100
  return Math.round(usd * rateTomanPerUsd)
}