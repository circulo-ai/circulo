import { AuthPageClient } from "./auth-page-client";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    "redirect",
    "sign-in",
    "sign-up",
    "forgot-password",
    "reset-password",
    "reset-link-sent",
    "sign-out",
    "verify-email",
    "magic-link",
    "magic-link-sent",
    "email-otp",
    "two-factor",
  ].map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return <AuthPageClient path={path} />;
}
