"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Delete02Icon,
  Edit02Icon,
  Link01Icon,
  PlusSignIcon,
  Refresh01Icon,
  ServerStack01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

type Scope = "organization" | "chat" | "agent";
type Integration = {
  id: string;
  name: string;
  description: string | null;
  endpoint: string;
  transport: "sse" | "streamable_http";
  status: "draft" | "published" | "disabled";
  enabled: boolean;
  lastScannedAt?: string | null;
  lastScanError?: string | null;
  tools: Array<{
    id: string;
    name: string;
    enabled: boolean;
    approvalMode: string;
  }>;
  links: Array<{
    id: string;
    scope: Scope;
    chatId: string | null;
    agentId: string | null;
    allowedTools: string[];
  }>;
};
type ChatOption = { id: string; title: string };
type AgentOption = { id: string; name: string };
type IntegrationForm = {
  name: string;
  description: string;
  endpoint: string;
  transport: "sse" | "streamable_http";
  credentialRef: string;
};

const emptyForm: IntegrationForm = {
  name: "",
  description: "",
  endpoint: "",
  transport: "streamable_http",
  credentialRef: "",
};
const integrationSchema = z.object({
  name: z.string().trim().min(1, "Give this connection a name.").max(200),
  description: z.string().trim().max(2000),
  endpoint: z.url("Enter a valid endpoint URL."),
  transport: z.enum(["sse", "streamable_http"]),
  credentialRef: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^MCP_CREDENTIAL_[A-Z0-9_]+$/.test(value),
      "Use an MCP_CREDENTIAL_* environment variable reference.",
    ),
});
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load MCP integrations");
  return response.json();
};
async function request<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.message ?? payload?.error ?? "Request failed");
  return payload as T;
}

export function WorkspaceTools({
  organization,
}: {
  organization?: { id?: string | null } | null;
}) {
  const {
    data: integrations,
    error,
    mutate,
  } = useSWR<Integration[]>(
    organization?.id ? "/api/automation/mcp" : null,
    fetcher,
  );
  const { data: chatHistory } = useSWR<{ chats: ChatOption[] }>(
    organization?.id ? "/api/history?limit=100" : null,
    fetcher,
  );
  const { data: agents } = useSWR<AgentOption[]>(
    organization?.id ? "/api/agent?limit=100" : null,
    fetcher,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [form, setForm] = useState<IntegrationForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);
  const [scope, setScope] = useState<{
    type: Scope;
    targetId: string;
    allowedTools: string;
  }>({ type: "organization", targetId: "", allowedTools: "" });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setEditorOpen(true);
  };
  const openEdit = (integration: Integration) => {
    setEditing(integration);
    setForm({
      name: integration.name,
      description: integration.description ?? "",
      endpoint: integration.endpoint,
      transport: integration.transport,
      credentialRef: "",
    });
    setErrors({});
    setEditorOpen(true);
  };
  const save = async () => {
    const parsed = integrationSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    if (!organization?.id && !editing) return;
    setSaving(true);
    try {
      const body = {
        ...parsed.data,
        description: parsed.data.description || null,
        credentialRef: parsed.data.credentialRef || null,
      };
      await request(
        editing ? `/api/automation/mcp/${editing.id}` : "/api/automation/mcp",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(
            editing ? body : { ...body, organizationId: organization?.id },
          ),
        },
      );
      await mutate();
      setEditorOpen(false);
      toast.success(
        editing ? "MCP connection updated" : "MCP connection added",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save MCP connection",
      );
    } finally {
      setSaving(false);
    }
  };
  const runAction = async (
    id: string,
    action: "test" | "scan" | "publish" | "disable",
  ) => {
    setWorkingId(id);
    try {
      if (action === "test") {
        const result = await request<{ toolCount: number }>(
          `/api/automation/mcp/${id}/test`,
          { method: "POST" },
        );
        toast.success(
          `Connection healthy · ${result.toolCount} tools available`,
        );
      } else if (action === "scan") {
        const result = await request<{ toolCount: number }>(
          `/api/automation/mcp/${id}/scan`,
          { method: "POST" },
        );
        toast.success(`Scanned server · ${result.toolCount} tools found`);
      } else {
        await request(`/api/automation/mcp/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: action === "publish" ? "published" : "disabled",
            enabled: action === "publish",
          }),
        });
        toast.success(
          action === "publish"
            ? "MCP connection published"
            : "MCP connection disabled",
        );
      }
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update MCP connection",
      );
    } finally {
      setWorkingId(null);
    }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    setWorkingId(deleteTarget.id);
    try {
      await request(`/api/automation/mcp/${deleteTarget.id}`, {
        method: "DELETE",
      });
      await mutate();
      toast.success("MCP connection removed");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to remove MCP connection",
      );
    } finally {
      setWorkingId(null);
    }
  };
  const link = async (integrationId: string) => {
    if (scope.type !== "organization" && !scope.targetId) {
      toast.error(`Choose a ${scope.type} for this scope`);
      return;
    }
    try {
      await request(`/api/automation/mcp/${integrationId}/links`, {
        method: "POST",
        body: JSON.stringify({
          scope: scope.type,
          ...(scope.type === "chat" ? { chatId: scope.targetId } : {}),
          ...(scope.type === "agent" ? { agentId: scope.targetId } : {}),
          allowedTools: scope.allowedTools
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      setScope({ type: "organization", targetId: "", allowedTools: "" });
      await mutate();
      toast.success("Tool access scope added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add tool scope",
      );
    }
  };
  const unlink = async (id: string) => {
    try {
      await request(`/api/automation/mcp/links/${id}`, { method: "DELETE" });
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove tool scope",
      );
    }
  };
  const availableTargets = useMemo(
    () =>
      scope.type === "chat"
        ? (chatHistory?.chats ?? []).map((item) => ({
            value: item.id,
            label: item.title,
          }))
        : (agents ?? []).map((item) => ({ value: item.id, label: item.name })),
    [scope.type, chatHistory?.chats, agents],
  );

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Wrench01Icon} />
          <AlertTitle>Tools unavailable</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={2} /> MCP
              connections
            </CardTitle>
            <CardDescription>
              Connect an external MCP server once, then control where its tools
              can run.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              data-icon="inline-start"
              strokeWidth={2}
            />{" "}
            Add server
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {integrations?.length ?? 0} connected server
            {integrations?.length === 1 ? "" : "s"}. Draft servers stay private
            until they are tested, scanned, and published.
          </p>
        </CardContent>
      </Card>
      {!integrations?.length ? (
        <Empty className="min-h-56 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Wrench01Icon} />
            </EmptyMedia>
            <EmptyTitle>No MCP servers connected</EmptyTitle>
            <EmptyDescription>
              Add a server to make external tools available to approved chats
              and agents.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={openCreate}>
            Add your first server
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {integration.name}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {integration.description || integration.endpoint}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      integration.status === "published" && integration.enabled
                        ? "secondary"
                        : integration.status === "draft"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {integration.status === "published" && integration.enabled
                      ? "Published"
                      : integration.status === "disabled"
                        ? "Disabled"
                        : "Draft"}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {integration.endpoint}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={workingId === integration.id}
                    onClick={() => openEdit(integration)}
                  >
                    <HugeiconsIcon
                      icon={Edit02Icon}
                      data-icon="inline-start"
                      strokeWidth={2}
                    />{" "}
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={workingId === integration.id}
                    onClick={() => void runAction(integration.id, "test")}
                  >
                    <HugeiconsIcon
                      icon={Refresh01Icon}
                      data-icon="inline-start"
                      strokeWidth={2}
                    />{" "}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={workingId === integration.id}
                    onClick={() => void runAction(integration.id, "scan")}
                  >
                    Scan tools
                  </Button>
                  {integration.status === "published" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={workingId === integration.id}
                      onClick={() => void runAction(integration.id, "disable")}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={
                        workingId === integration.id ||
                        !integration.lastScannedAt
                      }
                      onClick={() => void runAction(integration.id, "publish")}
                    >
                      Publish
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={workingId === integration.id}
                    onClick={() => setDeleteTarget(integration)}
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      data-icon="inline-start"
                      strokeWidth={2}
                    />{" "}
                    Remove
                  </Button>
                </div>
                {integration.lastScanError && (
                  <Alert variant="destructive">
                    <AlertTitle>Last scan failed</AlertTitle>
                    <AlertDescription>
                      {integration.lastScanError}
                    </AlertDescription>
                  </Alert>
                )}
                <Separator />
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      Discovered tools{" "}
                      <span className="text-muted-foreground">
                        ({integration.tools.length})
                      </span>
                    </p>
                    {integration.status === "published" && (
                      <Switch
                        checked={integration.enabled}
                        onCheckedChange={(enabled) =>
                          void request(
                            `/api/automation/mcp/${integration.id}`,
                            {
                              method: "PATCH",
                              body: JSON.stringify({ enabled }),
                            },
                          )
                            .then(() => mutate())
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Unable to update server",
                              ),
                            )
                        }
                        aria-label={`Enable ${integration.name}`}
                      />
                    )}
                  </div>
                  {integration.tools.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {integration.tools.map((tool) => (
                        <Badge
                          key={tool.id}
                          variant={tool.enabled ? "secondary" : "outline"}
                        >
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Run a scan to discover tools.
                    </p>
                  )}
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <HugeiconsIcon icon={Link01Icon} strokeWidth={2} /> Tool
                    access
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field>
                        <FieldLabel>Scope</FieldLabel>
                        <Select
                          value={scope.type}
                          onValueChange={(value) =>
                            setScope((current) => ({
                              ...current,
                              type: value as Scope,
                              targetId: "",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="organization">
                                Entire workspace
                              </SelectItem>
                              <SelectItem value="chat">One chat</SelectItem>
                              <SelectItem value="agent">One agent</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      {scope.type !== "organization" && (
                        <Field>
                          <FieldLabel>
                            {scope.type === "chat" ? "Chat" : "Agent"}
                          </FieldLabel>
                          <Select
                            value={scope.targetId}
                            onValueChange={(value) =>
                              setScope((current) => ({
                                ...current,
                                targetId: value ?? "",
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={`Choose a ${scope.type}`}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {availableTargets.map((target) => (
                                  <SelectItem
                                    key={target.value}
                                    value={target.value}
                                  >
                                    {target.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </div>
                    <Field>
                      <FieldLabel>Allowed tools</FieldLabel>
                      <Input
                        value={scope.allowedTools}
                        onChange={(event) =>
                          setScope((current) => ({
                            ...current,
                            allowedTools: event.target.value,
                          }))
                        }
                        placeholder="Optional, comma-separated tool names"
                      />
                      <FieldDescription>
                        Leave blank to allow all discovered tools in this scope.
                      </FieldDescription>
                    </Field>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void link(integration.id)}
                    >
                      Add access scope
                    </Button>
                  </div>
                  {integration.links.length ? (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {integration.links.map((item) => (
                        <div
                          className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs"
                          key={item.id}
                        >
                          <span>
                            <Badge className="mr-2" variant="outline">
                              {item.scope}
                            </Badge>
                            {item.chatId ?? item.agentId ?? "Entire workspace"}
                          </span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => void unlink(item.id)}
                            aria-label="Remove access scope"
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              strokeWidth={2}
                            />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No narrower access scopes yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit MCP connection" : "Add MCP connection"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Changing the endpoint returns this connection to draft until it is scanned again."
                : "Add the remote server details. Credentials stay server-side and are referenced by environment variable name."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="mcp-name">Connection name</FieldLabel>
              <Input
                id="mcp-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                aria-invalid={Boolean(errors.name)}
                placeholder="Research tools"
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="mcp-description">Description</FieldLabel>
              <Textarea
                id="mcp-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What this server is useful for"
              />
            </Field>
            <Field data-invalid={Boolean(errors.endpoint)}>
              <FieldLabel htmlFor="mcp-endpoint">Server endpoint</FieldLabel>
              <Input
                id="mcp-endpoint"
                type="url"
                value={form.endpoint}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endpoint: event.target.value,
                  }))
                }
                aria-invalid={Boolean(errors.endpoint)}
                placeholder="https://mcp.example.com"
              />
              {errors.endpoint && <FieldError>{errors.endpoint}</FieldError>}
            </Field>
            <Field>
              <FieldLabel>Transport</FieldLabel>
              <Select
                value={form.transport}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    transport: value as IntegrationForm["transport"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="streamable_http">
                      Streamable HTTP
                    </SelectItem>
                    <SelectItem value="sse">Server-sent events</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={Boolean(errors.credentialRef)}>
              <FieldLabel htmlFor="mcp-credential">
                Credential reference{" "}
                <span className="text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id="mcp-credential"
                value={form.credentialRef}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    credentialRef: event.target.value,
                  }))
                }
                aria-invalid={Boolean(errors.credentialRef)}
                placeholder="MCP_CREDENTIAL_RESEARCH"
              />
              <FieldDescription>
                Use the name of an environment variable. Never paste a secret
                here.
              </FieldDescription>
              {errors.credentialRef && (
                <FieldError>{errors.credentialRef}</FieldError>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Spinner />} {editing ? "Save changes" : "Add server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the connection and all of its access scopes. It
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(workingId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              disabled={Boolean(workingId)}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              Remove connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
