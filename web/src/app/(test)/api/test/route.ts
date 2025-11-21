import { streamAgent } from "@/ai/agent/runner";
import { getSession } from "@/lib/auth";
import { google } from "@ai-sdk/google";
import { convertToModelMessages } from "ai";
import { NextRequest } from "next/server";

const googleProvider = google("gemini-2.5-flash");

export async function POST(req: NextRequest) {
  try {
    const { messages, orgId } = await req.json();

    const session = await getSession();
    const userId = session?.user?.id || "";

    // Stream the chat response with tool usage
    const stream = await streamAgent({
      stream: true,
      userId,
      organizationId: orgId,
      messages: convertToModelMessages(messages),
      agentId: "ba4de936-3799-46ac-a18d-8fa728aa1c75",
      chatId: "1a75d0f6-dfa3-46dc-9ee3-8b1e2ae47142",
    });

    return stream.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
