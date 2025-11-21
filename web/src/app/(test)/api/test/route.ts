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
      agentId: "8a13c8a1-190e-4468-97ec-a8edd6cbbb97",
      chatId: "62b9b2da-aecc-427a-a315-9711fd3730ed",
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
