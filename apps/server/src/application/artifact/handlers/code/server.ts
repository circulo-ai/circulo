import { codePrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { Output, streamText } from "ai";
import { z } from "zod";

export const codeDocumentHandler = createDocumentHandler<"code">({
  kind: "code",
  onCreateDocument: async ({ title, dataStream, session }) => {
    let draftContent = "";

    const { partialOutputStream } = streamText({
      model: await resolveLanguageModel({
        userId: session.userId,
        providerId: session.providerId,
        modelId: session.modelId,
      }),
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
  onUpdateDocument: async ({ document, description, dataStream, session }) => {
    let draftContent = "";

    const { partialOutputStream } = streamText({
      model: await resolveLanguageModel({
        userId: session.userId,
        providerId: session.providerId,
        modelId: session.modelId,
      }),
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
