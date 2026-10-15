import { expect, it } from "vitest";
import {
  buildContentFromDocument,
  buildDocumentFromContent,
} from "./functions";

it("opens saved Markdown synchronously without a browser or React effects", () => {
  const content =
    "# Release requirements\n\nA release must have one named owner.\n\n- Documented rollback plan\n- Accessibility check\n\n```ts\nconst verified = true;\n```";
  const doc = buildDocumentFromContent(content);
  expect(doc.textContent).toContain("A release must have one named owner.");
  expect(doc.textContent).toContain("const verified = true;");
  expect(buildContentFromDocument(doc)).toContain("# Release requirements");
  expect(buildDocumentFromContent("").textContent).toBe("");
});
