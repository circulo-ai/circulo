import { chat, db } from "@/db";
import { authenticateRequest } from "@/lib/auth/request";
import { verifyInternalToken } from "@/lib/auth/internal";
import { createLogger } from "@/lib/logs/console/logger";
import { eq } from "drizzle-orm";

const logger = createLogger("HybridAuth");

export interface AuthResult {
  success: boolean;
  userId?: string;
  authType?: "session" | "api_key" | "internal_jwt";
  error?: string;
}

export async function checkHybridAuth(
  request: Request,
  options: { requireChatId?: boolean } = {},
): Promise<AuthResult> {
  try {
    // 1. Internal JWT
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1] || "";
      const verification = await verifyInternalToken(token);

      if (verification.valid) {
        let chatId: string | null = null;
        let userId: string | null = verification.userId || null;

        const { searchParams } = new URL(request.url);
        chatId = searchParams.get("chatId");
        if (!userId) userId = searchParams.get("userId");

        if (!chatId && !userId && request.method === "POST") {
          try {
            const clonedRequest = request.clone();
            const bodyText = await clonedRequest.text();
            if (bodyText) {
              const body = JSON.parse(bodyText);
              chatId = body.chatId || body._context?.chatId;
              userId = userId || body.userId || body._context?.userId;
            }
          } catch {}
        }

        if (userId) {
          return { success: true, userId, authType: "internal_jwt" };
        }

        if (chatId) {
          const [chatData] = await db
            .select({ userId: chat.creatorId })
            .from(chat)
            .where(eq(chat.id, chatId))
            .limit(1);

          if (!chatData) return { success: false, error: "Chat not found" };

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

        return { success: true, authType: "internal_jwt" };
      }
    }

    // 2. Better Auth API-key or session auth
    const principal = await authenticateRequest(request);
    if (principal?.userId) {
      return {
        success: true,
        userId: principal.userId,
        authType: principal.authMethod,
      };
    }

    return {
      success: false,
      error:
        "Authentication required - provide session, API key, or internal JWT",
    };
  } catch (error) {
    logger.error("Error in hybrid authentication:", error);
    return { success: false, error: "Authentication error" };
  }
}
