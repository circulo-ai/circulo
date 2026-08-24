import { describe, expect, it } from "vitest";
import { buildImageKnowledgeContent, extractVisionText } from "./vision-utils";

describe("knowledge vision helpers", () => {
  it("extracts text from string and multimodal response content", () => {
    expect(extractVisionText("  hello  ")).toBe("hello");
    expect(
      extractVisionText([
        { type: "text", text: "Readable text" },
        { type: "image_url", text: "ignored" },
        { type: "text", text: "Visual description" },
      ]),
    ).toBe("Readable text\nVisual description");
  });

  it("builds stable searchable image content", () => {
    expect(buildImageKnowledgeContent("diagram.png", "Readable text")).toBe(
      "Image attachment: diagram.png\n\nVisual extraction:\nReadable text",
    );
  });
});
