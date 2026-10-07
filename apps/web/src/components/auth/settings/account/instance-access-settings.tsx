"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";

type InstanceAuthPolicy = {
  runtimeKind: "self-hosted" | "desktop";
  signupEnabled: boolean;
  bootstrapCompleted: boolean;
};

/**
 * Admin-only control for local account provisioning. Cloud deployments return
 * a 404 and therefore do not expose a misleading local sign-up setting.
 */
export function InstanceAccessSettings() {
  const [policy, setPolicy] = useState<InstanceAuthPolicy | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/instance/auth-policy", { credentials: "include" })
      .then(async (response) => {
        if (response.status === 404 || response.status === 403) return null;
        if (!response.ok)
          throw new Error("Unable to load instance access settings");
        return (await response.json()) as InstanceAuthPolicy;
      })
      .then((value) => {
        if (active && value) setPolicy(value);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!policy) return null;

  const updateSignupPolicy = async (signupEnabled: boolean) => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/instance/auth-policy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signupEnabled }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Unable to update sign-up settings");
      }
      setPolicy((await response.json()) as InstanceAuthPolicy);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instance access</CardTitle>
        <CardDescription>
          This {policy.runtimeKind} runtime uses local accounts. The first
          account is the instance administrator.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-medium">Allow new accounts</p>
            <p className="text-sm text-muted-foreground">
              Turn this off to require an invitation or administrator action
              before anyone else can sign up.
            </p>
          </div>
          <Switch
            aria-label="Allow new accounts"
            checked={policy.signupEnabled}
            disabled={pending || !policy.bootstrapCompleted}
            onCheckedChange={(checked) => void updateSignupPolicy(checked)}
          />
        </div>
        {!policy.bootstrapCompleted && (
          <p className="text-sm text-muted-foreground">
            Sign-up remains open until the first administrator account is
            created.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
