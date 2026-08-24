"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { Check, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type OrganizationMember = {
  id: string;
  userId: string;
  role: string;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  email?: string;
};
type WorkspaceRole = {
  key: string;
  name: string;
  permissions: Array<{ resource: string; action: string }>;
};

export function Team() {
  const {
    data: organization,
    isPending,
    refetch,
  } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const { data: roleData } = useSWR<{ roles: WorkspaceRole[] }>(
    organization?.id ? "/api/workspace/roles" : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Unable to load workspace roles");
      return response.json();
    },
  );
  const organizationApi = authClient.organization as unknown as Record<
    string,
    (input: Record<string, unknown>) => Promise<unknown>
  >;

  const run = async (
    action: string,
    input: Record<string, unknown>,
    success: string,
  ) => {
    const method = organizationApi[action];
    if (!method) {
      toast.error("Organization membership actions are unavailable");
      return;
    }
    setBusy(true);
    try {
      const result = await method(input);
      if ((result as { error?: unknown })?.error)
        throw new Error("The organization service rejected this request");
      await refetch?.();
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update team",
      );
    } finally {
      setBusy(false);
    }
  };

  if (isPending)
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading team…</div>
    );
  if (!organization)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No active workspace selected.
      </div>
    );

  const members = (organization.members ?? []) as OrganizationMember[];
  const invitations = (organization.invitations ?? []) as Array<{
    id: string;
    email: string;
    role: string;
  }>;
  const currentMember = members.find(
    (member) => member.userId === session?.user?.id,
  );
  const currentRole = roleData?.roles.find(
    (item) => item.key === currentMember?.role,
  );
  const canManageTeam =
    currentMember?.role === "owner" ||
    currentMember?.role === "admin" ||
    Boolean(
      currentRole?.permissions.some(
        (permission) =>
          (permission.resource === "member" &&
            ["create", "update"].includes(permission.action)) ||
          (permission.resource === "workspace" &&
            permission.action === "manage"),
      ),
    );
  const roleOptions = roleData?.roles.filter(
    (item) => item.key !== "owner",
  ) ?? [
    { key: "member", name: "Member", permissions: [] },
    { key: "admin", name: "Admin", permissions: [] },
  ];
  const roleName = (roleKey: string) =>
    roleData?.roles.find((item) => item.key === roleKey)?.name ??
    (roleKey === "owner" ? "Owner" : roleKey === "admin" ? "Admin" : "Member");
  const updateMemberRole = async (memberId: string, roleKey: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace/members/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message ?? payload?.error ?? "Unable to update member role",
        );
      }
      await refetch?.();
      toast.success("Role updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update member role",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-base font-medium">{organization.name} team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite workspace members and manage their organization roles.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="member@example.com"
          type="email"
        />
        <Select
          onValueChange={(value) => {
            if (value) setRole(value);
          }}
          value={role}
        >
          <SelectTrigger className="w-auto min-w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          disabled={busy || !canManageTeam || !email.trim()}
          onClick={() =>
            void run(
              "inviteMember",
              { email: email.trim(), role, organizationId: organization.id },
              "Invitation sent",
            )
          }
        >
          <UserPlus className="mr-2 size-4" />
          Invite
        </Button>
      </div>
      <div className="space-y-2">
        {members.map((member) => {
          const name =
            member.user?.name ||
            member.user?.email ||
            member.email ||
            member.id;
          return (
            <div
              className="flex items-center justify-between rounded-md border px-3 py-2"
              key={member.id}
            >
              <div>
                <div className="text-sm">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {roleName(member.role)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Select
                  onValueChange={(value) =>
                    value && void updateMemberRole(member.id, value)
                  }
                  value={member.role}
                >
                  <SelectTrigger
                    aria-label={`Role for ${name}`}
                    className="h-8 w-auto text-xs"
                    disabled={!canManageTeam || member.role === "owner"}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roleOptions.map((roleOption) => (
                        <SelectItem key={roleOption.key} value={roleOption.key}>
                          {roleOption.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  aria-label={`Remove ${name}`}
                  disabled={busy || !canManageTeam || member.role === "owner"}
                  onClick={() =>
                    void run(
                      "removeMember",
                      {
                        memberIdOrEmail: member.id,
                        organizationId: organization.id,
                      },
                      "Member removed",
                    )
                  }
                  size="icon"
                  variant="ghost"
                >
                  <UserMinus className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {invitations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Pending invitations</h3>
          {invitations.map((invitation) => (
            <div
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              key={invitation.id}
            >
              <span>
                {invitation.email} · {invitation.role}
              </span>
              <Button
                disabled={!canManageTeam || busy}
                onClick={() =>
                  void run(
                    "cancelInvitation",
                    {
                      invitationId: invitation.id,
                      organizationId: organization.id,
                    },
                    "Invitation cancelled",
                  )
                }
                size="sm"
                variant="ghost"
              >
                <Check className="mr-1 size-3" />
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
