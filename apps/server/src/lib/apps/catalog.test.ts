import { describe, expect, it } from "vitest";
import { CONNECTED_APP_CATALOG, getConnectedAppDefinition } from "./catalog";

describe("connected app catalog", () => {
  it("only advertises connectors with executable read-only tools", () => {
    expect(CONNECTED_APP_CATALOG).toHaveLength(1);
    expect(getConnectedAppDefinition("github-repo")?.tools).toEqual([
      "githubListRepositories",
      "githubGetRepository",
      "githubSearchRepositories",
    ]);
    expect(getConnectedAppDefinition("google-calendar")).toBeUndefined();
  });
});
