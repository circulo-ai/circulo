import { sheetPrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { Output, streamText } from "ai";
import { z } from "zod";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, session }) => {
    let draftContent = "";

    const { partialOutputStream } = streamText({
      model: await resolveLanguageModel({
        userId: session.userId,
        providerId: session.providerId,
        modelId: session.modelId,
      }),
      system: sheetPrompt,
      prompt: title,
      output: Output.object({
        schema: z.object({ csv: z.string().describe("CSV data") }),
      }),
    });

    for await (const partialObject of partialOutputStream) {
      const csv = partialObject.csv;
      if (csv) {
        dataStream.write({
          type: "data-sheetDelta",
          data: csv,
          transient: true,
        });

        draftContent = csv;
      }
    }

    dataStream.write({
      type: "data-sheetDelta",
      data: draftContent,
      transient: true,
    });

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
      system: updateDocumentPrompt(document.content, "sheet"),
      prompt: description,
      output: Output.object({ schema: z.object({ csv: z.string() }) }),
    });

    for await (const partialObject of partialOutputStream) {
      const csv = partialObject.csv;
      if (csv) {
        dataStream.write({
          type: "data-sheetDelta",
          data: csv,
          transient: true,
        });

        draftContent = csv;
      }
    }

    return draftContent;
  },
});
