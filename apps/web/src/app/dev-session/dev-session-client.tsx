"use client";

import { useEffect, useState } from "react";

type SessionBootstrap = {
  authenticated: boolean;
  user: { email: string; name: string | null };
  organizationId: string | null;
};

export default function DevSessionClient() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; data: SessionBootstrap }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/dev-session/session", { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as
          | SessionBootstrap
          | { message?: string };
        if (!response.ok || !("authenticated" in body)) {
          throw new Error(
            "message" in body ? body.message : "Unable to create local session",
          );
        }
        return body;
      })
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to create local session",
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <main>Preparing the local test session…</main>;
  }
  if (state.status === "error") {
    return <main>Local test session failed: {state.message}</main>;
  }

  return (
    <main>
      <h1>Local test session ready</h1>
      <p>{state.data.user.email}</p>
      <p>{state.data.organizationId ?? "No active workspace"}</p>
    </main>
  );
}
