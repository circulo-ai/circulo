"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceMembers } from "@/components/workspace/workspace-members";
import { WorkspaceAccount } from "@/components/workspace/workspace-account";
import { WorkspacePermissions } from "@/components/workspace/workspace-permissions";
import { WorkspaceShell, type WorkspaceSection } from "@/components/workspace/workspace-shell";
import { WorkspaceTools } from "@/components/workspace/workspace-tools";
import { authClient } from "@/lib/auth-client";
import { Building01Icon, ArrowRight01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const sectionCopy: Record<WorkspaceSection, { title: string; description: string }> = {
  overview: { title: "Overview", description: "A single control center for your people, AI resources, tools, and workspace defaults." },
  members: { title: "Members & roles", description: "Invite collaborators and make access predictable across the workspace." },
  permissions: { title: "Permissions", description: "Understand what each role can do before changing access or sharing a chat." },
  agents: { title: "Agents", description: "Manage agents from the workspace resource library." },
  knowledge: { title: "Knowledge", description: "Organize durable sources that agents can use in the right chats." },
  memory: { title: "Memory", description: "Review and control the facts Circulo can remember across conversations." },
  tools: { title: "Tools & MCP", description: "Connect external tool servers and scope their use to a workspace, chat, or agent." },
  automation: { title: "Automation", description: "Schedule work, review approvals, and coordinate handoffs." },
  plugins: { title: "Plugins", description: "Review the real capabilities available to your Circulo workspace." },
  account: { title: "Account settings", description: "Personalize your experience and manage your account defaults." },
  billing: { title: "Billing", description: "Review plan and subscription details for this workspace." },
};

export default function WorkspacePage() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("section") as WorkspaceSection | null;
  const activeSection = requested && requested in sectionCopy ? requested : "overview";
  const { data: organization } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();
  const copy = sectionCopy[activeSection];

  const content = activeSection === "members" ? <WorkspaceMembers /> : activeSection === "permissions" ? <WorkspacePermissions /> : activeSection === "tools" ? <WorkspaceTools /> : activeSection === "account" ? <WorkspaceAccount /> : activeSection === "overview" ? <Overview organization={organization} session={session} /> : <RedirectCard section={activeSection} />;

  return <WorkspaceShell activeSection={activeSection} description={copy.description} title={copy.title}>{content}</WorkspaceShell>;
}

function Overview({ organization, session }: { organization?: { name?: string | null; members?: unknown[] } | null; session?: { user?: { name?: string | null; email?: string | null } } | null }) {
  return <div className="flex flex-col gap-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={Building01Icon} strokeWidth={2} /> {organization?.name ?? "Your workspace"}</CardTitle><CardDescription>Everything your team needs to configure Circulo lives here.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{organization?.members?.length ?? 0} members</Badge><Badge variant="outline">Signed in as {session?.user?.name ?? session?.user?.email ?? "you"}</Badge></CardContent></Card><div className="grid gap-4 md:grid-cols-2"><QuickLink href="/workspace?section=members" icon={UserGroupIcon} title="Invite your team" description="Manage members and workspace roles." /><QuickLink href="/workspace?section=tools" icon={Building01Icon} title="Connect tools" description="Set up MCP servers and scope tool access." /><QuickLink href="/knowledge" icon={Building01Icon} title="Build your knowledge library" description="Give agents durable, searchable context." /><QuickLink href="/memory" icon={Building01Icon} title="Review memory" description="Control what persists across conversations." /></div></div>;
}

function QuickLink({ href, icon, title, description }: { href: string; icon: typeof Building01Icon; title: string; description: string }) {
  return <Link className="group" href={href}><Card className="h-full transition-colors group-hover:border-primary/50"><CardHeader><CardTitle className="flex items-center justify-between gap-3 text-base"><span className="flex items-center gap-2"><HugeiconsIcon icon={icon} strokeWidth={2} />{title}</span><HugeiconsIcon className="text-muted-foreground transition-transform group-hover:translate-x-1" icon={ArrowRight01Icon} strokeWidth={2} /></CardTitle><CardDescription>{description}</CardDescription></CardHeader></Card></Link>;
}

function RedirectCard({ section }: { section: WorkspaceSection }) {
  const href: Record<string, string> = { agents: "/agents", knowledge: "/knowledge", memory: "/memory", automation: "/automation", plugins: "/plugins", billing: "/pricing" };
  return <Card><CardHeader><CardTitle>Continue in {sectionCopy[section].title}</CardTitle><CardDescription>This workspace section is already available in its dedicated surface.</CardDescription></CardHeader><CardContent><Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={href[section] ?? "/chat"}>Open {sectionCopy[section].title}</Link></CardContent></Card>;
}
