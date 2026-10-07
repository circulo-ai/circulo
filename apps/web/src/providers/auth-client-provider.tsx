"use client";

import { AuthProvider } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin";
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { themePlugin } from "@/lib/auth/theme-plugin";
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin";
import { getEnv } from "@/lib/env";
import { getBaseUrl } from "@/lib/urls/utils";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type RuntimeKind = "cloud" | "self-hosted" | "desktop";

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>(
    (getEnv("NEXT_PUBLIC_CIRCULO_RUNTIME_KIND") as RuntimeKind | undefined) ??
      "cloud",
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/instance/info", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { runtimeKind?: RuntimeKind } | null) => {
        if (active && value?.runtimeKind) setRuntimeKind(value.runtimeKind);
      })
      .catch(() => {
        // Cloud remains the safe default if the runtime-info endpoint is not
        // reachable during the initial shell render.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthProvider
      authClient={authClient}
      baseURL={getBaseUrl()}
      redirectTo="/chat"
      emailAndPassword={{
        enabled: runtimeKind !== "cloud",
        requireEmailVerification: false,
      }}
      socialProviders={["google"]}
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
  );
}
