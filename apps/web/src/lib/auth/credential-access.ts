import { db } from "@/db";
import { account, chat } from "@/db/schema";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import { isMemberOf } from "@/lib/permissions";
import { eq } from "drizzle-orm";

export interface CredentialAccessResult {
  ok: boolean;
  error?: string;
  authType?: "session" | "api_key" | "internal_jwt";
  requesterUserId?: string;
  credentialOwnerUserId?: string;
  organizationId?: string;
}

/**
 * Centralizes auth + collaboration rules for credential use.
 * - Uses checkHybridAuth to authenticate the caller
 * - Fetches credential owner
 * - Authorization rules:
 *   - session/api_key: allow if requester owns the credential; otherwise require chatId and
 *     verify BOTH requester and owner have access to the chat's organization
 *   - internal_jwt: require chatId (by default) and verify credential owner has access to the
 *     chat's organization (requester identity is the system/chat)
 */
export async function authorizeCredentialUse(
  request: Request,
  params: {
    credentialId: string;
    chatId?: string;
    requireChatIdForInternal?: boolean;
  },
): Promise<CredentialAccessResult> {
  const { credentialId, chatId, requireChatIdForInternal = true } = params;

  const auth = await checkHybridAuth(request, {
    requireChatId: requireChatIdForInternal,
  });
  if (!auth.success || !auth.userId) {
    return { ok: false, error: auth.error || "Authentication required" };
  }

  // Lookup credential owner
  const [credRow] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(eq(account.id, credentialId))
    .limit(1);

  if (!credRow) {
    return { ok: false, error: "Credential not found" };
  }

  const credentialOwnerUserId = credRow.userId;

  // If requester owns the credential, allow immediately
  if (
    auth.authType !== "internal_jwt" &&
    auth.userId === credentialOwnerUserId
  ) {
    return {
      ok: true,
      authType: auth.authType,
      requesterUserId: auth.userId,
      credentialOwnerUserId,
    };
  }

  // For collaboration paths, chatId is required to scope to an organization
  if (!chatId) {
    return { ok: false, error: "chatId is required" };
  }

  const [chatRow] = await db
    .select({ organizationId: chat.organizationId })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  if (!chatRow || !chatRow.organizationId) {
    return { ok: false, error: "Chat not found" };
  }

  if (auth.authType === "internal_jwt") {
    // Internal calls: verify credential owner belongs to the chat's organization
    const ownerIsMember = await isMemberOf(
      credentialOwnerUserId,
      chatRow.organizationId,
    );

    if (!ownerIsMember) {
      return { ok: false, error: "Unauthorized" };
    }

    return {
      ok: true,
      authType: auth.authType,
      requesterUserId: auth.userId,
      credentialOwnerUserId,
      organizationId: chatRow.organizationId,
    };
  }

  // Session/API key: verify BOTH requester and owner belong to the chat's organization
  const requesterIsMember = await isMemberOf(
    auth.userId,
    chatRow.organizationId,
  );
  const ownerIsMember = await isMemberOf(
    credentialOwnerUserId,
    chatRow.organizationId,
  );

  if (!requesterIsMember || !ownerIsMember) {
    return { ok: false, error: "Unauthorized" };
  }

  return {
    ok: true,
    authType: auth.authType,
    requesterUserId: auth.userId,
    credentialOwnerUserId,
    organizationId: chatRow.organizationId,
  };
}
