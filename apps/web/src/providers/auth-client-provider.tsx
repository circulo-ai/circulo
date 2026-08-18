"use client";

import { AuthProvider } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin";
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { themePlugin } from "@/lib/auth/theme-plugin";
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin";
import { getBaseUrl } from "@/lib/urls/utils";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { setTheme } = useTheme();

  return (
    <AuthProvider
      authClient={authClient}
      baseURL={getBaseUrl()}
      redirectTo="/chat"
      emailAndPassword={{ enabled: false }}
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
