import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: chatId } = await params;
    
    // This endpoint is for streaming chat updates
    // For now, return a simple response indicating streaming is handled by Trigger.dev
    return NextResponse.json({
      message: "Chat streaming is handled via Trigger.dev realtime streams",
      chatId,
    });
  } catch (error) {
    const { id } = await params;
    console.error(`Failed to handle stream request for chat ${id}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}