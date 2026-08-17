"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckmarkCircle02Icon, LockIcon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const permissions = [
  { label: "Create and share chats", owner: true, admin: true, member: true },
  { label: "Update shared chat settings", owner: true, admin: true, member: false },
  { label: "Invite and manage members", owner: true, admin: true, member: false },
  { label: "Manage workspace settings", owner: true, admin: false, member: false },
  { label: "Manage agents, knowledge, and memory", owner: true, admin: true, member: false },
  { label: "Manage tools and MCP connections", owner: true, admin: true, member: false },
  { label: "Manage billing and workspace deletion", owner: true, admin: false, member: false },
];

function PermissionMark({ enabled }: { enabled: boolean }) {
  return enabled ? <HugeiconsIcon aria-label="Allowed" className="text-primary" icon={CheckmarkCircle02Icon} strokeWidth={2} /> : <HugeiconsIcon aria-label="Not allowed" className="text-muted-foreground/50" icon={LockIcon} strokeWidth={2} />;
}

export function WorkspacePermissions() {
  return <div className="flex flex-col gap-6">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={ShieldUserIcon} strokeWidth={2} /> Role permissions</CardTitle><CardDescription>Workspace roles set the default access level. Chat owners can add narrower, chat-scoped permissions from chat settings.</CardDescription></CardHeader>
      <CardContent><Table><TableHeader><TableRow><TableHead>Capability</TableHead><TableHead className="w-24 text-center">Owner</TableHead><TableHead className="w-24 text-center">Admin</TableHead><TableHead className="w-24 text-center">Member</TableHead></TableRow></TableHeader><TableBody>{permissions.map((permission) => <TableRow key={permission.label}><TableCell className="font-medium">{permission.label}</TableCell><TableCell className="text-center"><PermissionMark enabled={permission.owner} /></TableCell><TableCell className="text-center"><PermissionMark enabled={permission.admin} /></TableCell><TableCell className="text-center"><PermissionMark enabled={permission.member} /></TableCell></TableRow>)}</TableBody></Table></CardContent>
    </Card>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-base">Owner</CardTitle><CardDescription>Full control over the workspace, including billing and deletion.</CardDescription></CardHeader><CardContent><Badge>1 role per workspace</Badge></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Admin</CardTitle><CardDescription>Runs the day-to-day workspace: people, agents, knowledge, and tools.</CardDescription></CardHeader><CardContent><Badge variant="secondary">Operational access</Badge></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Member</CardTitle><CardDescription>Creates and shares chats without changing workspace configuration.</CardDescription></CardHeader><CardContent><Badge variant="outline">Chat access</Badge></CardContent></Card>
    </div>
  </div>;
}
