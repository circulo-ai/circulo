import { auth } from "@/lib/auth";
import type { Session, User } from "better-auth";
import { ForbiddenError, UnauthorizedError } from "../errors";

// Re-export for convenience
export { ForbiddenError, UnauthorizedError };

export type AuthContext = {
  session: Session;
  user: User;
  activeOrganizationId?: string;
};

export type OptionalAuthContext = {
  session: Session | null;
  user: User | null;
};

type SessionResponse = { session: Session; user: User } | null;

async function getSessionFromRequest(
  request: Request,
): Promise<SessionResponse> {
  const headersList = new Headers();
  request.headers.forEach((value, key) => headersList.set(key, value));
  return await auth.api.getSession({ headers: headersList });
}

export function authMiddleware() {
  return async (request: Request): Promise<AuthContext> => {
    const result = await getSessionFromRequest(request);
    if (!result?.session || !result?.user) {
      throw new UnauthorizedError();
    }
    return {
      session: result.session,
      user: result.user,
      activeOrganizationId: (result.session as any).activeOrganizationId,
    };
  };
}

export function optionalAuthMiddleware() {
  return async (request: Request): Promise<OptionalAuthContext> => {
    const result = await getSessionFromRequest(request);
    return {
      session: result?.session ?? null,
      user: result?.user ?? null,
    };
  };
}

export function requireRoleMiddleware(allowedRoles: string[]) {
  return async (request: Request): Promise<AuthContext> => {
    const result = await getSessionFromRequest(request);
    if (!result?.session || !result?.user) {
      throw new UnauthorizedError();
    }
    const userRole = (result.user as any).role as string | undefined;
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    return { session: result.session, user: result.user };
  };
}

export function requireVerifiedEmailMiddleware() {
  return async (request: Request): Promise<AuthContext> => {
    const result = await getSessionFromRequest(request);
    if (!result?.session || !result?.user) {
      throw new UnauthorizedError();
    }
    if (!(result.user as any).emailVerified) {
      throw new ForbiddenError("Email verification required");
    }
    return { session: result.session, user: result.user };
  };
}
