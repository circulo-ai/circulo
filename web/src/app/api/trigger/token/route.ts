import { NextRequest, NextResponse } from "next/server";
import { auth as triggerAuth } from "@trigger.dev/sdk/v3";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // Verify user authentication
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create a public access token for the chat processing task
    // This token allows the client to subscribe to realtime updates
    const publicAccessToken = await triggerAuth.createPublicToken({
      scopes: {
        read: {
          tasks: ["process-chat"], // Allow reading runs for the process-chat task
        },
      },
      expirationTime: "1h", // Token expires in 1 hour
    });

    return NextResponse.json({ 
      accessToken: publicAccessToken,
      expiresIn: 3600, // 1 hour in seconds
    });
  } catch (error) {
    console.error("Failed to create Trigger.dev public access token:", error);
    return NextResponse.json(
      { error: "Failed to create access token" },
      { status: 500 }
    );
  }
}