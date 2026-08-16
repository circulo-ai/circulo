import { codePrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { Output, streamText } from "ai";
import { z } from "zod";

export const codeDocumentHandler = createDocumentHandler<"code">({
  kind: "code",
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = "";

    const { partialOutputStream } = streamText({
      model: myProvider.languageModel("artifact-model"),
      system: codePrompt,
      prompt: title,
      output: Output.object({ schema: z.object({ code: z.string() }) }),
    });

    for await (const partialObject of partialOutputStream) {
      const code = partialObject.code;
      if (code) {
        dataStream.write({
          type: "data-codeDelta",
          data: code,
          transient: true,
        });

        draftContent = code;
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = "";

    const { partialOutputStream } = streamText({
      model: myProvider.languageModel("artifact-model"),
      system: updateDocumentPrompt(document.content, "code"),
      prompt: description,
      output: Output.object({ schema: z.object({ code: z.string() }) }),
    });

    for await (const partialObject of partialOutputStream) {
      const code = partialObject.code;
      if (code) {
        dataStream.write({
          type: "data-codeDelta",
          data: code,
          transient: true,
        });

        draftContent = code;
      }
    }

    return draftContent;
  },
});
