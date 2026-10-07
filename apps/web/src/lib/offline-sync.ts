"use client";

export type SyncStatus = "offline" | "idle" | "syncing" | "error";

export type SyncRuntime = {
  status: SyncStatus;
  cursor?: string | null;
  localCursor?: string | null;
  remoteCursor?: string | null;
  lastError?: string;
};

const STATE_KEY = "circulo-sync-state";
const DEVICE_KEY = "circulo-device-id";
const TOKEN_PREFIX = "circulo-sync-token:";

function getDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

function getState(): SyncRuntime {
  try {
    const state = JSON.parse(window.localStorage.getItem(STATE_KEY) ?? "null");
    if (state && typeof state === "object") return state as SyncRuntime;
  } catch {
    // Reset malformed local state.
  }
  return {
    status: navigator.onLine ? "idle" : "offline",
    localCursor: null,
    remoteCursor: null,
  };
}

function saveState(state: SyncRuntime) {
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  window.dispatchEvent(
    new CustomEvent("circulo:sync-status", { detail: state }),
  );
}

function tokenKey(remoteBaseUrl: string) {
  return `${TOKEN_PREFIX}${remoteBaseUrl.replace(/\/$/, "")}`;
}

function getRemoteToken(remoteBaseUrl: string) {
  return window.localStorage.getItem(tokenKey(remoteBaseUrl));
}

export async function exchangeCloudPairingToken(
  remoteBaseUrl: string,
  pairingToken: string,
) {
  const response = await requestJson<{
    accessToken: string;
    expiresAt: string;
    organizationId: string;
  }>(`${remoteBaseUrl.replace(/\/$/, "")}/api/sync/pairing/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingToken, deviceId: getDeviceId() }),
  });
  window.localStorage.setItem(tokenKey(remoteBaseUrl), response.accessToken);
  return response;
}

export function clearCloudPairing(remoteBaseUrl: string) {
  window.localStorage.removeItem(tokenKey(remoteBaseUrl));
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
  bearerToken?: string | null,
): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`Sync request failed (${response.status})`);
  return (await response.json()) as T;
}

/**
 * Replicate the local append-only change feed to another Circulo deployment.
 * Both sides use the same conflict rule: newest updatedAt wins, while the
 * server returns losing rows so a UI can surface a conflict rather than
 * silently discarding it.
 */
export async function syncWithDeployment(
  remoteBaseUrl: string,
): Promise<SyncRuntime> {
  const state = getState();
  if (!navigator.onLine) {
    const offline = { ...state, status: "offline" as const };
    saveState(offline);
    return offline;
  }

  saveState({ ...state, status: "syncing", lastError: undefined });
  try {
    const localBase = window.location.origin;
    const remoteToken = getRemoteToken(remoteBaseUrl);
    if (!remoteToken) {
      throw new Error(
        "Cloud pairing is required before offline sync can start",
      );
    }
    const localCursor = state.localCursor ?? state.cursor ?? null;
    const remoteCursor = state.remoteCursor ?? null;
    const localPullQuery = localCursor
      ? `?cursor=${encodeURIComponent(localCursor)}&limit=100`
      : "?limit=100";
    const localChanges = await requestJson<{
      changes: Array<Record<string, unknown>>;
      nextCursor: string | null;
    }>(`${localBase}/api/sync/pull${localPullQuery}`, {
      headers: { "X-Circulo-Device-Id": getDeviceId() },
    });

    if (localChanges.changes.length > 0) {
      await requestJson(
        `${remoteBaseUrl.replace(/\/$/, "")}/api/sync/push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Circulo-Device-Id": getDeviceId(),
          },
          body: JSON.stringify({ changes: localChanges.changes }),
        },
        remoteToken,
      );
    }

    const remotePullQuery = remoteCursor
      ? `?cursor=${encodeURIComponent(remoteCursor)}&limit=100`
      : "?limit=100";
    const remoteChanges = await requestJson<{
      changes: Array<Record<string, unknown>>;
      nextCursor: string | null;
    }>(
      `${remoteBaseUrl.replace(/\/$/, "")}/api/sync/pull${remotePullQuery}`,
      {
        headers: { "X-Circulo-Device-Id": getDeviceId() },
      },
      remoteToken,
    );

    if (remoteChanges.changes.length > 0) {
      await requestJson(`${localBase}/api/sync/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Circulo-Device-Id": getDeviceId(),
        },
        body: JSON.stringify({ changes: remoteChanges.changes }),
      });
    }

    const next = {
      status: "idle" as const,
      localCursor: localChanges.nextCursor ?? localCursor,
      remoteCursor: remoteChanges.nextCursor ?? remoteCursor,
    };
    saveState(next);
    return next;
  } catch (error) {
    const failed = {
      ...state,
      status: "error" as const,
      lastError: error instanceof Error ? error.message : "Sync failed",
    };
    saveState(failed);
    return failed;
  }
}

export function startOfflineSync(remoteBaseUrl?: string) {
  const sync = () => {
    if (remoteBaseUrl) void syncWithDeployment(remoteBaseUrl);
    else
      saveState({
        ...getState(),
        status: navigator.onLine ? "idle" : "offline",
      });
  };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
  return () => {
    window.removeEventListener("online", sync);
    window.removeEventListener("offline", sync);
  };
}

export function getSyncRuntime(): SyncRuntime {
  return getState();
}
