import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Validate an MCP URL and prevent server-side requests to private networks. */
export async function validateMcpEndpoint(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP endpoint must use HTTP or HTTPS");
  }

  if (process.env.NODE_ENV !== "production") return url.toString();

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    isPrivateAddress(hostname)
  ) {
    throw new Error(
      "MCP endpoints on private networks are disabled in production",
    );
  }

  // Validate DNS answers at request time as well as the configured hostname.
  // This blocks common DNS-rebinding and cloud metadata targets.
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (
    records.length === 0 ||
    records.some((record) => isPrivateAddress(record.address))
  ) {
    throw new Error("MCP endpoint resolves to a private network");
  }

  return url.toString();
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second! >= 64 && second! <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second! >= 16 && second! <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && octets[2] === 0) ||
      (first === 192 && second === 0 && octets[2] === 2) ||
      (first === 198 && second === 18) ||
      (first === 198 && second === 19) ||
      (first === 198 && second === 51 && octets[2] === 100) ||
      (first === 203 && second === 0 && octets[2] === 113) ||
      first! >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:127.")
    );
  }

  return false;
}
