"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

type Permission = { resource: string; action: string };
type WorkspaceRole = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
};
type RolesResponse = { roles: WorkspaceRole[]; permissions: Permission[] };

const roleSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  description: z.string().trim().max(240),
});

const fetcher = async (url: string): Promise<RolesResponse> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message ?? payload?.error ?? "Unable to load roles",
    );
  }
  return payload as RolesResponse;
};

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "Request failed");
  }
  return payload;
}

function permissionKey(permission: Permission) {
  return `${permission.resource}:${permission.action}`;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function WorkspacePermissions() {
  const { data: organization } = authClient.useActiveOrganization();
  const { data, error, isLoading, mutate } = useSWR<RolesResponse>(
    organization?.id ? "/api/workspace/roles" : null,
    fetcher,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceRole | null>(null);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of data?.permissions ?? []) {
      const group = groups.get(permission.resource) ?? [];
      group.push(permission);
      groups.set(permission.resource, group);
    }
    return [...groups.entries()];
  }, [data?.permissions]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setSelected([]);
    setErrors({});
    setEditorOpen(true);
  };

  const openEdit = (role: WorkspaceRole) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? "");
    setSelected(role.permissions.map(permissionKey));
    setErrors({});
    setEditorOpen(true);
  };

  const togglePermission = (permission: Permission, checked: boolean) => {
    const key = permissionKey(permission);
    setSelected((current) =>
      checked
        ? [...new Set([...current, key])]
        : current.filter((item) => item !== key),
    );
  };

  const save = async () => {
    const parsed = roleSchema.safeParse({ name, description });
    if (!parsed.success) {
      setErrors({
        name: parsed.error.issues[0]?.message ?? "Enter a role name.",
      });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const permissions = (data?.permissions ?? []).filter((permission) =>
        selected.includes(permissionKey(permission)),
      );
      await request(
        editing ? `/api/workspace/roles/${editing.id}` : "/api/workspace/roles",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({ ...parsed.data, permissions }),
        },
      );
      await mutate();
      setEditorOpen(false);
      toast.success(editing ? "Role updated" : "Role created");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Unable to save role",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await request(`/api/workspace/roles/${deleteTarget.id}`, {
        method: "DELETE",
      });
      await mutate();
      toast.success("Role deleted");
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete role",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Loading workspace roles…
      </div>
    );
  }
  if (error) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={ShieldUserIcon} />
          </EmptyMedia>
          <EmptyTitle>Roles are unavailable</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => void mutate()} variant="outline">
          Try again
        </Button>
      </Empty>
    );
  }

  const roles = data?.roles ?? [];
  const systemRoles = roles.filter((role) => role.isSystem);
  const customRoles = roles.filter((role) => !role.isSystem);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={ShieldUserIcon} strokeWidth={2} /> Role
              permissions
            </CardTitle>
            <CardDescription>
              Control what each workspace role can access. Custom roles apply to
              members assigned through workspace membership.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <HugeiconsIcon
              data-icon="inline-start"
              icon={PlusSignIcon}
              strokeWidth={2}
            />{" "}
            Create role
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {systemRoles.map((role) => (
            <RoleCard key={role.id} role={role} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom roles</CardTitle>
          <CardDescription>
            Use focused access bundles such as Researcher, Reviewer, or Billing
            coordinator without granting full admin access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {customRoles.map((role) => (
            <div
              className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              key={role.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{role.name}</p>
                  <Badge variant="secondary">
                    {role.permissions.length} permissions
                  </Badge>
                </div>
                <p className="mt-1 text-sm break-words text-muted-foreground">
                  {role.description || "No description"}
                </p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  onClick={() => openEdit(role)}
                  size="sm"
                  variant="outline"
                >
                  <HugeiconsIcon
                    data-icon="inline-start"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />{" "}
                  Edit
                </Button>
                <Button
                  aria-label={`Delete ${role.name}`}
                  onClick={() => setDeleteTarget(role)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </div>
            </div>
          ))}
          {customRoles.length === 0 && (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No custom roles yet</EmptyTitle>
                <EmptyDescription>
                  Create a role when the built-in Owner, Admin, and Member
                  access levels are too broad.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={openCreate} variant="outline">
                Create your first role
              </Button>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit custom role" : "Create custom role"}
            </DialogTitle>
            <DialogDescription>
              Give the role a clear purpose and select only the permissions it
              needs. You can assign it to members after saving.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="workspace-role-name">Role name</FieldLabel>
              <Input
                id="workspace-role-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
                placeholder="Researcher"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <FieldError>{errors.name}</FieldError>
              ) : (
                <FieldDescription>
                  Use a name people can understand at a glance.
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="workspace-role-description">
                Description
              </FieldLabel>
              <Textarea
                id="workspace-role-description"
                maxLength={240}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
                placeholder="Can research and review knowledge without managing workspace settings."
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium">Permissions</p>
              <p className="text-sm text-muted-foreground">
                Choose the smallest set of capabilities this role needs.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupedPermissions.map(([resource, permissions]) => (
                <div className="rounded-xl border p-3" key={resource}>
                  <p className="mb-2 text-sm font-medium">
                    {titleCase(resource)}
                  </p>
                  <div className="flex flex-col gap-2">
                    {permissions.map((permission) => {
                      const key = permissionKey(permission);
                      return (
                        <label
                          className="flex min-w-0 items-center gap-2 text-sm"
                          key={key}
                        >
                          <Checkbox
                            checked={selected.includes(key)}
                            onCheckedChange={(checked) =>
                              togglePermission(permission, checked === true)
                            }
                          />
                          <span className="break-words">
                            {titleCase(permission.action)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={saving}
              onClick={() => setEditorOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <Spinner />} {editing ? "Save role" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the custom role and its permission policy. Members
              assigned to it must be reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleCard({ role }: { role: WorkspaceRole }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">{role.name}</CardTitle>
        <CardDescription>{role.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant={role.key === "owner" ? "default" : "secondary"}>
          {role.permissions.length} permissions
        </Badge>
      </CardContent>
    </Card>
  );
}
