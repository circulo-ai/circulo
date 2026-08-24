import { TooltipProvider } from "@/components/ui/tooltip";
import { env, isTruthy } from "@/lib/env";
import { cn } from "@/lib/utils";
import { AuthClientProvider } from "@/providers/auth-client-provider";
import { PointerProvider } from "@/providers/pointer-provider";
import { SWRProvider } from "@/providers/swr-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { AutumnProvider } from "autumn-js/react";
import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

// Use system font stack to avoid build-time font fetching

export const metadata: Metadata = {
  title: "Circulo AI",
  description: "Circle of AI powered minds!",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const isBillingEnabled = isTruthy(env.NEXT_PUBLIC_BILLING_ENABLED);

  const content = (
    <SWRProvider>
      <PointerProvider>
        <TooltipProvider>
          <AuthClientProvider>{children}</AuthClientProvider>
        </TooltipProvider>
        <Toaster />
      </PointerProvider>
    </SWRProvider>
  );

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(
        "scroll-smooth sm:snap-y sm:snap-mandatory",
        "font-sans",
        figtree.variable,
      )}
    >
      <body className={cn("font-sans", "antialiased")}>
        <ThemeProvider>
          {isBillingEnabled ? (
            <AutumnProvider
              backendUrl={
                env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3002"
              }
              includeCredentials={true}
              pathPrefix="/api/auth/autumn"
              useBetterAuth
            >
              {content}
            </AutumnProvider>
          ) : (
            content
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}

// TODO button active style
// TODO prettier: https://chatgpt.com/c/69338b4a-b524-8328-879b-13bb0bda08a8
// TODO stylelint
// TODO global eslint, stylelint...
// TODO eslint-config-prettier
// TODO try to move the prettier dependencies to the packages/prettier-config
// TODO rename the prettier-config package to prettier (or configs)
