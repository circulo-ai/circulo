"use client";

import { Auth } from "@/components/auth/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useInstanceAuth } from "@/providers/instance-auth-context";
import Link from "next/link";
import { AlreadyLoggedInCard } from "./components/already-logged-in";

const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL;
const privacyUrl = process.env.NEXT_PUBLIC_PRIVACY_URL;

export function AuthPageClient({ path }: { path: string }) {
  const { data: session } = useSession();
  const { localAuth, ready, signupEnabled } = useInstanceAuth();

  if (path === "sign-up" && localAuth && !ready) {
    return (
      <output className="text-sm text-muted-foreground">
        Loading account setup…
      </output>
    );
  }

  if (path === "sign-up" && localAuth && !signupEnabled) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Account creation is closed</CardTitle>
          <CardDescription>
            An administrator has disabled new account creation for this
            instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="underline underline-offset-4" href="/auth/sign-in">
            Return to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-6")}>
      {session?.user ? (
        <AlreadyLoggedInCard />
      ) : (
        <>
          <Auth
            path={path}
            socialLayout="vertical"
            className="flex flex-col gap-6"
          />
          {termsUrl && privacyUrl && (
            <FieldDescription className="px-6 text-center">
              By clicking continue, you agree to our{" "}
              <a href={termsUrl}>Terms of Service</a> and{" "}
              <a href={privacyUrl}>Privacy Policy</a>.
            </FieldDescription>
          )}
        </>
      )}
    </div>
  );
}
