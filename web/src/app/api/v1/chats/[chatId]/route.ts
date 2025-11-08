import { api } from "@/lib/server";
import { chat } from "@/workflows/chat";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { z } from "zod";

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export const POST = api(
  {
    auth: true,
    body: z.object({
      messages: z.array(z.custom<UIMessage>()),
    }),
  },
  async (req, ctx) => {
    const messages = ctx.body.messages;
    const workflowHandle = await start(chat, [messages]);
    const runId = workflowHandle.runId;
    const stream = workflowHandle.readable;

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-workflow-run-id": runId,
      },
    });
  },
);
