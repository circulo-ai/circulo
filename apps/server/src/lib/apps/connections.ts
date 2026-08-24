import { account, db } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  CONNECTED_APP_CATALOG,
  getConnectedAppDefinition,
  type ConnectedAppSummary,
} from "./catalog";

export async function getConnectedAppsForUser(
  userId: string,
): Promise<ConnectedAppSummary[]> {
  const providerIds = CONNECTED_APP_CATALOG.map(
    (definition) => definition.providerId,
  );
  if (!providerIds.length) return [];

  const accounts = await db
    .select({
      id: account.id,
      providerId: account.providerId,
      accountId: account.accountId,
      accessToken: account.accessToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
    })
    .from(account)
    .where(
      and(eq(account.userId, userId), inArray(account.providerId, providerIds)),
    );

  return accounts.flatMap((connectedAccount) => {
    const definition = getConnectedAppDefinition(connectedAccount.providerId);
    if (!definition) return [];
    return [
      {
        ...definition,
        id: `app:${connectedAccount.providerId}:${connectedAccount.id}`,
        type: "app" as const,
        status:
          connectedAccount.accessToken &&
          (connectedAccount.accessTokenExpiresAt === null ||
            connectedAccount.accessTokenExpiresAt.getTime() > Date.now())
            ? ("connected" as const)
            : ("needs_reconnect" as const),
        connectionId: connectedAccount.id,
        accountLabel: connectedAccount.accountId,
      },
    ];
  });
}
