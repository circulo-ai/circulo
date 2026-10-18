"use client";

import { AuthProvider } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin";
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { themePlugin } from "@/lib/auth/theme-plugin";
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin";
import { runtimeKind as buildRuntimeKind } from "@/lib/environment";
import { getBaseUrl } from "@/lib/urls/utils";
import {
  InstanceAuthContext,
  type InstanceAuthState,
  type RuntimeKind,
} from "@/providers/instance-auth-context";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

function isRuntimeKind(value: unknown): value is RuntimeKind {
  return value === "cloud" || value === "self-hosted" || value === "desktop";
}

function initialAuthState(): InstanceAuthState {
  const runtime = isRuntimeKind(buildRuntimeKind) ? buildRuntimeKind : "cloud";
  return {
    runtimeKind: runtime,
    localAuth: runtime !== "cloud",
    signupEnabled: false,
    socialProviders: [],
    ready: false,
  };
}

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [instanceAuth, setInstanceAuth] = useState(initialAuthState);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadInstanceAuth() {
      let retryDelay = 500;
      while (active) {
        try {
          const response = await fetch("/api/instance/info", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) {
            if (response.status < 500) return;
          } else {
            const value: unknown = await response.json();
            if (
              typeof value === "object" &&
              value !== null &&
              "runtimeKind" in value &&
              isRuntimeKind(value.runtimeKind)
            ) {
              const info = value as {
                runtimeKind: RuntimeKind;
                localAuth?: boolean;
                signupEnabled?: boolean;
                socialProviders?: unknown;
              };
              setInstanceAuth({
                runtimeKind: info.runtimeKind,
                localAuth:
                  typeof info.localAuth === "boolean"
                    ? info.localAuth
                    : info.runtimeKind !== "cloud",
                signupEnabled: info.signupEnabled === true,
                socialProviders:
                  Array.isArray(info.socialProviders) &&
                  info.socialProviders.includes("google")
                    ? ["google"]
                    : [],
                ready: true,
              });
              return;
            }
            return;
          }
        } catch {
          if (!active || controller.signal.aborted) return;
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 8_000);
      }
    }

    void loadInstanceAuth();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <InstanceAuthContext.Provider value={instanceAuth}>
      <AuthProvider
        authClient={authClient}
        baseURL={getBaseUrl()}
        redirectTo="/chat"
        emailAndPassword={{
          enabled: instanceAuth.runtimeKind !== "cloud",
          requireEmailVerification: false,
        }}
        socialProviders={instanceAuth.socialProviders}
        plugins={[
          emailOtpPlugin({
            signIn: true,
            emailVerification: true,
            changeEmail: true,
          }),
          magicLinkPlugin(),
          organizationPlugin({ teams: true }),
          themePlugin({ useTheme: () => ({ setTheme }) }),
          twoFactorPlugin({ allowPasswordless: true }),
        ]}
        navigate={({ to, replace }) => {
          if (replace) router.replace(to);
          else router.push(to);
        }}
        Link={Link}
      >
        {children}
      </AuthProvider>
    </InstanceAuthContext.Provider>
  );
}
