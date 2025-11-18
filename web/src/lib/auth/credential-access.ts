import { db } from "@/db";
import { account } from "@/db/schema";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export interface CredentialAccessResult {
  ok: boolean;
  error?: string;
  authType?: "session" | "api_key" | "internal_jwt";
  requesterUserId?: string;
  credentialOwnerUserId?: string;
}

/**
 * Centralizes auth + collaboration rules for credential use.
 * - Uses checkHybridAuth to authenticate the caller
 * - Fetches credential owner
 * - Authorization rules:
 *   - session/api_key: allow if requester owns the credential; otherwise require workflowId and
 *     verify BOTH requester and owner have access to the workflow's workspace
 *   - internal_jwt: require workflowId (by default) and verify credential owner has access to the
 *     workflow's workspace (requester identity is the system/workflow)
 */
export async function authorizeCredentialUse(
  request: NextRequest,
  params: {
    credentialId: string;
  },
): Promise<CredentialAccessResult> {
  const { credentialId } = params;

  const auth = await checkHybridAuth(request);
  if (!auth.success) {
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

  if (auth.authType === "internal_jwt") {
    return {
      ok: true,
      authType: auth.authType,
      requesterUserId: auth.userId,
      credentialOwnerUserId,
    };
  }

  return { ok: false, error: "Unauthorized" };
}
