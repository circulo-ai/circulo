import { describe, expect, it } from "vitest";
import {
  getKnowledgeAssetKey,
  getKnowledgeImageContentType,
  hasKnowledgeImageSignature,
  isKnowledgeImageDocument,
  toKnowledgeImageDataUrl,
} from "./assets";

describe("knowledge image assets", () => {
  it("normalizes supported raster image uploads", () => {
    expect(getKnowledgeImageContentType("photo.JPG", "")).toBe("image/jpeg");
    expect(getKnowledgeImageContentType("photo.png", "image/png")).toBe(
      "image/png",
    );
    expect(getKnowledgeImageContentType("photo.svg", "image/svg+xml")).toBe(
      null,
    );
  });

  it("only treats documents with a stored asset as visual knowledge", () => {
    expect(
      isKnowledgeImageDocument({
        contentType: "image/png",
        metadata: { assetKey: "kb/documents/one.png" },
      }),
    ).toBe(true);
    expect(
      isKnowledgeImageDocument({ contentType: "image/png", metadata: {} }),
    ).toBe(false);
    expect(getKnowledgeAssetKey({ assetKey: "  " })).toBe(null);
  });

  it("creates a bounded model-ready data URL", () => {
    expect(toKnowledgeImageDataUrl(Buffer.from([0, 1, 2]), "image/png")).toBe(
      "data:image/png;base64,AAEC",
    );
  });

  it("rejects renamed files that do not match their raster format", () => {
    expect(
      hasKnowledgeImageSignature(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).toBe(true);
    expect(
      hasKnowledgeImageSignature(Buffer.from("not an image"), "image/png"),
    ).toBe(false);
  });
});
