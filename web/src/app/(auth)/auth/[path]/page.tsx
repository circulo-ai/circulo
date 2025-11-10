import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { AuthView, SignedIn, SignedOut } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import { AlreadyLoggedInCard } from "./components/already-logged-in";


export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <div className={cn("flex w-full flex-col gap-6")}>
      <SignedOut>
        <AuthView
          redirectTo="/chats"
          socialLayout={"vertical"}
          className={"flex flex-col gap-6"}
          path={path}
        />
        <FieldDescription className="px-6 text-center">
          By clicking continue, you agree to our{" "}
          <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
        </FieldDescription>
      </SignedOut>
      <SignedIn>
        <AlreadyLoggedInCard />
      </SignedIn>
    </div>
  );
}
