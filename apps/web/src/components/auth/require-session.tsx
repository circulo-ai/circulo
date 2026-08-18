"use client";

import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace(`/auth/sign-in?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [isPending, pathname, router, session?.user]);

  if (isPending || !session?.user) {
    return <Spinner className="m-auto" />;
  }

  return children;
}
