import { chat, db } from "@/db";
import { getSession } from "@/lib/auth";
import { verifyInternalToken } from "@/lib/auth/internal";
import { createLogger } from "@/lib/logs/console/logger";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

const logger = createLogger("HybridAuth");

export interface AuthResult {
  success: boolean;
  userId?: string;
  authType?: "session" | "api_key" | "internal_jwt";
  error?: string;
}

/**
 * Check for authentication using any of the 3 supported methods:
 * 1. Session authentication (cookies)
 * 2. API key authentication (X-API-Key header)
 *
 * For internal JWT calls, requires chatId to determine user context
 */
export async function checkHybridAuth(
  request: NextRequest,
  options: { requireChatId?: boolean } = {},
): Promise<AuthResult> {
  try {
    // 1. Check for internal JWT token first
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const verification = await verifyInternalToken(token);

      if (verification.valid) {
        let chatId: string | null = null;
        let userId: string | null = verification.userId || null;

        const { searchParams } = new URL(request.url);
        chatId = searchParams.get("chatId");
        if (!userId) {
          userId = searchParams.get("userId");
        }

        if (!chatId && !userId && request.method === "POST") {
          try {
            // Clone the request to avoid consuming the original body
            const clonedRequest = request.clone();
            const bodyText = await clonedRequest.text();
            if (bodyText) {
              const body = JSON.parse(bodyText);
              chatId = body.chatId || body._context?.chatId;
              userId = userId || body.userId || body._context?.userId;
            }
          } catch {
            // Ignore JSON parse errors
          }
        }

        if (userId) {
          return {
            success: true,
            userId,
            authType: "internal_jwt",
          };
        }

        if (chatId) {
          const [chatData] = await db
            .select({ userId: chat.creatorId })
            .from(chat)
            .where(eq(chat.id, chatId))
            .limit(1);

          if (!chatData) {
            return {
              success: false,
              error: "Chat not found",
            };
          }

          return {
            success: true,
            userId: chatData.userId,
            authType: "internal_jwt",
          };
        }

        if (options.requireChatId !== false) {
          return {
            success: false,
            error: "chatId or userId required for internal JWT calls",
          };
        }

        return {
          success: true,
          authType: "internal_jwt",
        };
      }
    }

    // 2. Try session auth (for web UI)
    const session = await getSession();
    if (session?.user?.id) {
      return {
        success: true,
        userId: session.user.id,
        authType: "session",
      };
    }

    // No authentication found
    return {
      success: false,
      error:
        "Authentication required - provide session, API key, or internal JWT",
    };
  } catch (error) {
    logger.error("Error in hybrid authentication:", error);
    return {
      success: false,
      error: "Authentication error",
    };
  }
}
