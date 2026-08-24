import { isIP } from "node:net";

export function parseTrustedProxyIps(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export function isValidTrustedProxy(value: string): boolean {
  const parts = value.split("/");
  if (parts.length > 2) return false;

  const address = parts[0] ?? "";
  const addressVersion = isIP(address);
  if (addressVersion === 0) return false;
  if (parts.length === 1) return true;

  const prefix = parts[1] ?? "";
  if (!/^\d+$/.test(prefix)) return false;
  const prefixLength = Number(prefix);
  const maxPrefixLength = addressVersion === 4 ? 32 : 128;
  return prefixLength <= maxPrefixLength;
}

export function getValidTrustedProxyIps(value: string | undefined): string[] {
  return parseTrustedProxyIps(value).filter(isValidTrustedProxy);
}

export function hasInvalidTrustedProxy(value: string | undefined): boolean {
  const entries = parseTrustedProxyIps(value);
  return entries.some((entry) => !isValidTrustedProxy(entry));
}
