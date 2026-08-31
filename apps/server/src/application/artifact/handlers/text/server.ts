import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { smoothStream, streamText } from "ai";

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, session }) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: await resolveLanguageModel({
        userId: session.userId,
        providerId: session.providerId,
        modelId: session.modelId,
      }),
      system:
        "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: title,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "text-delta") {
        const { text } = delta;

        draftContent += text;

        dataStream.write({
          type: "data-textDelta",
          data: text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, session }) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: await resolveLanguageModel({
        userId: session.userId,
        providerId: session.providerId,
        modelId: session.modelId,
      }),
      system: updateDocumentPrompt(document.content, "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "text-delta") {
        const { text } = delta;

        draftContent += text;

        dataStream.write({
          type: "data-textDelta",
          data: text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
