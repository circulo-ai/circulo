import { describe, expect, it } from "vitest";
import {
  getValidTrustedProxyIps,
  hasInvalidTrustedProxy,
  isValidTrustedProxy,
  parseTrustedProxyIps,
} from "./trusted-proxies";

describe("trusted proxy configuration", () => {
  it("parses and de-duplicates comma-separated entries", () => {
    expect(parseTrustedProxyIps(" 127.0.0.1, 10.0.0.0/8,127.0.0.1 ")).toEqual([
      "127.0.0.1",
      "10.0.0.0/8",
    ]);
  });

  it("accepts IPv4, IPv6, and valid CIDR ranges", () => {
    expect(isValidTrustedProxy("127.0.0.1")).toBe(true);
    expect(isValidTrustedProxy("10.0.0.0/8")).toBe(true);
    expect(isValidTrustedProxy("2001:db8::/32")).toBe(true);
  });

  it("rejects malformed addresses and prefixes", () => {
    expect(isValidTrustedProxy("proxy.example.com")).toBe(false);
    expect(isValidTrustedProxy("10.0.0.0/33")).toBe(false);
    expect(isValidTrustedProxy("2001:db8::/129")).toBe(false);
    expect(isValidTrustedProxy("127.0.0.1/not-a-prefix")).toBe(false);
  });

  it("reports invalid entries and keeps only valid entries for auth", () => {
    const value = "127.0.0.1,proxy.example.com,2001:db8::/32";
    expect(hasInvalidTrustedProxy(value)).toBe(true);
    expect(getValidTrustedProxyIps(value)).toEqual([
      "127.0.0.1",
      "2001:db8::/32",
    ]);
  });
});
