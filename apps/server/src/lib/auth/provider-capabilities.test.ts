import { describe, expect, it } from "vitest";
import {
  getAvailableSocialProviders,
  hasGoogleOAuthCredentials,
} from "./provider-capabilities";

describe("authentication provider capabilities", () => {
  it("only enables Google when both credentials are present", () => {
    expect(hasGoogleOAuthCredentials("id", "secret")).toBe(true);
    expect(hasGoogleOAuthCredentials("id", undefined)).toBe(false);
    expect(hasGoogleOAuthCredentials(undefined, "secret")).toBe(false);
    expect(hasGoogleOAuthCredentials("  ", "secret")).toBe(false);
  });

  it("returns only safe provider identifiers for the client", () => {
    expect(getAvailableSocialProviders(true)).toEqual(["google"]);
    expect(getAvailableSocialProviders(false)).toEqual([]);
  });
});
