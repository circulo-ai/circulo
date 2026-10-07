import { Organization } from "@/components/auth/organization/organization";
import { RequireSession } from "@/components/auth/require-session";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const organizationPath = path.at(-1) ?? "settings";

  return (
    <RequireSession>
      <main className="flex min-h-full justify-center overflow-y-auto p-4 sm:p-8">
        <div className="w-full max-w-4xl">
          <Organization path={organizationPath} />
        </div>
      </main>
    </RequireSession>
  );
}
