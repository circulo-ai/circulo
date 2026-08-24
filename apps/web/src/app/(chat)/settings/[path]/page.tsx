import { RequireSession } from "@/components/auth/require-session";
import { Settings } from "@/components/auth/settings/settings";

export const dynamicParams = false;

export function generateStaticParams() {
  return ["account", "profile", "security", "organizations"].map((path) => ({
    path,
  }));
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  const settingsPath = path === "profile" ? "account" : path;

  return (
    <RequireSession>
      <main className="flex min-h-full justify-center overflow-y-auto p-4 sm:p-8">
        <div className="w-full max-w-4xl">
          <Settings path={settingsPath} />
        </div>
      </main>
    </RequireSession>
  );
}
