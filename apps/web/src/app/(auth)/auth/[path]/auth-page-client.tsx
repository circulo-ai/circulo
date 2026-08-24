"use client";

import { Auth } from "@/components/auth/auth";
import { FieldDescription } from "@/components/ui/field";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { AlreadyLoggedInCard } from "./components/already-logged-in";

const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL;
const privacyUrl = process.env.NEXT_PUBLIC_PRIVACY_URL;

export function AuthPageClient({ path }: { path: string }) {
  const { data: session } = useSession();

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
