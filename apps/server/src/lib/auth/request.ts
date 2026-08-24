import { auth, getSession, type SessionResponse } from "@/lib/auth";

export type AuthPrincipal = {
  userId?: string;
  authMethod: "session" | "api_key";
  session: SessionResponse;
  apiKeyId?: string;
  apiKeyPermissions?: Record<string, string[]> | null;
  organizationId?: string;
};

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the two supported public authentication mechanisms without ever
 * creating a synthetic Better Auth session for an API key.
 */
export async function authenticateRequest(
  request: Request,
): Promise<AuthPrincipal | null> {
  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey) {
    const result = await (auth.api as any).verifyApiKey({
      body: { key: apiKey },
    });

    if (!result.valid || !result.key?.referenceId) return null;

    const metadata = parseMetadata(result.key.metadata);
    const permissions = result.key.permissions ?? null;
    const isOrganizationKey = result.key.configId === "organization";
    return {
      userId: isOrganizationKey ? undefined : result.key.referenceId,
      authMethod: "api_key",
      apiKeyId: result.key.id,
      apiKeyPermissions: permissions,
      organizationId: isOrganizationKey
        ? result.key.referenceId
        : typeof metadata.organizationId === "string"
          ? metadata.organizationId
          : undefined,
      session: {
        user: null,
        session: null,
      } as unknown as SessionResponse,
    };
  }

  const session = await getSession(request);
  if (!session?.user?.id) return null;

  return {
    userId: session.user.id,
    authMethod: "session",
    organizationId: (session.session as any)?.activeOrganizationId,
    session,
  };
}
