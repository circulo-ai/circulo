"use client";

import { getAuthLinkURL } from "@better-auth-ui/core";
import { useAuth } from "@better-auth-ui/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { OpenEmailButton } from "./open-email-button";
import { useIsHydrated } from "./use-is-hydrated";

/** `sessionStorage` key the forgot-password form stores the submitted email under. */
export const RESET_LINK_SENT_STORAGE_KEY = "better-auth-ui.reset-link-sent";

export type ResetLinkSentProps = {
  className?: string;
};

/**
 * Render a card confirming that a password-reset email was sent, with a
 * button to open the user's email provider.
 *
 * The target email is read from `sessionStorage` (set when the forgot-password
 * form redirects here); the OpenEmail button is only shown when an email is
 * stored and resolves to a known provider.
 *
 * @param className - Additional CSS classes applied to the card
 * @returns The reset-link-sent card React element
 */
export function ResetLinkSent({ className }: ResetLinkSentProps) {
  const { basePaths, localization, redirectTo, viewPaths, Link } = useAuth();

  const isHydrated = useIsHydrated();
  const isDesktop =
    isHydrated &&
    typeof window !== "undefined" &&
    Boolean(window.circuloDesktop);
  const [email, setEmail] = useState(
    (isHydrated && sessionStorage.getItem(RESET_LINK_SENT_STORAGE_KEY)) || "",
  );
  const [desktopResetLink, setDesktopResetLink] = useState<string | null>(null);
  const [desktopResetLinkUnavailable, setDesktopResetLinkUnavailable] =
    useState(false);

  useEffect(() => {
    setEmail(sessionStorage.getItem(RESET_LINK_SENT_STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    const desktop = window.circuloDesktop;
    if (!desktop || !email) return;

    let isCurrent = true;
    void desktop
      .runtimeInfo()
      .then(({ apiUrl }) =>
        fetch(`${apiUrl}/api/auth/desktop/password-reset-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        }),
      )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to retrieve reset link");
        const result = (await response.json()) as { resetUrl: string | null };
        if (isCurrent) {
          setDesktopResetLink(result.resetUrl);
          setDesktopResetLinkUnavailable(!result.resetUrl);
        }
      })
      .catch(() => {
        if (isCurrent) setDesktopResetLinkUnavailable(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [email]);

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {localization.auth.checkYourEmailTitle}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          <FieldDescription>
            {isDesktop && desktopResetLink
              ? "Your password reset link is ready for this desktop account."
              : email
                ? localization.auth.resetLinkSentTo.replace("{{email}}", email)
                : localization.auth.passwordResetEmailSent}
          </FieldDescription>

          {isDesktop ? (
            desktopResetLink ? (
              <Button asChild>
                <a href={desktopResetLink}>Open password reset</a>
              </Button>
            ) : desktopResetLinkUnavailable ? (
              <FieldDescription role="status">
                No reset link is available. Check the account email and request
                a new link.
              </FieldDescription>
            ) : null
          ) : (
            email && <OpenEmailButton email={email} />
          )}
        </div>

        <div className="mt-4 flex w-full flex-col items-center gap-3">
          <FieldDescription className="text-center">
            {localization.auth.rememberYourPassword}{" "}
            <Link
              href={getAuthLinkURL(
                `${basePaths.auth}/${viewPaths.auth.signIn}`,
                redirectTo,
              )}
              className="underline underline-offset-4"
            >
              {localization.auth.signIn}
            </Link>
          </FieldDescription>
        </div>
      </CardContent>
    </Card>
  );
}
