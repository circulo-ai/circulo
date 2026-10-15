import { describe, expect, it } from "vitest";
import { appendArtifactReferences } from "./artifact-references";

describe("saved artifact references", () => {
  it("includes successful saved IDs once without exposing failed results", () => {
    const record = {
      toolName: "createDocument",
      successful: true,
      output: { id: "saved-id", title: "Release report" },
    };
    expect(
      appendArtifactReferences("Done", [
        record,
        { ...record, toolName: "readDocument" },
      ]),
    ).toBe("Done\n\nSaved documents:\n- Release report — ID: `saved-id`");
    expect(appendArtifactReferences("saved-id", [record])).toBe("saved-id");
    expect(
      appendArtifactReferences("Failed", [{ ...record, successful: false }]),
    ).toBe("Failed");
  });
});
