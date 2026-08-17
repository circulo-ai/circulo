"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  organizationName: string;
  inviterEmail: string;
};

export default function OrganizationInvitationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invitationId = useMemo(() => params.id, [params.id]);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) {
      router.replace(
        `/auth/sign-in?redirectTo=/invite/${encodeURIComponent(invitationId)}`,
      );
      return;
    }

    let cancelled = false;
    void fetch(
      `/api/auth/organization/get-invitation?id=${encodeURIComponent(invitationId)}`,
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | Invitation
          | { message?: string }
          | null;
        if (!response.ok) {
          throw new Error(
            (payload && "message" in payload && payload.message) ||
              "This invitation is no longer available",
          );
        }
        if (!cancelled) setInvitation(payload as Invitation);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load this invitation",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [invitationId, router, session?.user, sessionPending]);

  const respond = async (action: "accept-invitation" | "reject-invitation") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/organization/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to process invitation");
      router.replace(action === "accept-invitation" ? "/chat" : "/");
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to process invitation",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Circulo workspace invitation
          </p>
          <h1 className="text-2xl font-semibold">
            {invitation
              ? `Join ${invitation.organizationName}`
              : "Workspace invitation"}
          </h1>
          {invitation && (
            <p className="text-sm text-muted-foreground">
              {invitation.inviterEmail} invited you as a {invitation.role}.
            </p>
          )}
        </div>

        {sessionPending || (!invitation && !error) ? (
          <p className="text-sm text-muted-foreground">Loading invitation…</p>
        ) : error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <div className="flex gap-3">
            <Button
              disabled={busy}
              onClick={() => void respond("accept-invitation")}
            >
              {busy ? "Working…" : "Accept invitation"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void respond("reject-invitation")}
              variant="outline"
            >
              Decline
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
