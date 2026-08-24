"use client";

import { RequireSession } from "@/components/auth/require-session";
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
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Brain, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

type MemoryScope = "user" | "organization" | "chat" | "agent";
type Memory = {
  id: string;
  scope: MemoryScope;
  key: string;
  content: string;
  chatId: string | null;
  agentId: string | null;
  userId: string | null;
  updatedAt?: string;
};
type ChatOption = { id: string; title: string };
type AgentOption = { id: string; name: string; model?: string };
const emptyForm = {
  scope: "user" as MemoryScope,
  chatId: "",
  agentId: "",
  key: "",
  content: "",
};
const memoryFormSchema = z
  .object({
    scope: z.enum(["user", "organization", "chat", "agent"]),
    chatId: z.string(),
    agentId: z.string(),
    key: z.string().trim().min(1, "Give this memory a short name.").max(200),
    content: z
      .string()
      .trim()
      .min(1, "Write the fact or preference to remember.")
      .max(20_000),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "chat" && !value.chatId.trim())
      ctx.addIssue({
        code: "custom",
        path: ["chatId"],
        message: "Enter the chat ID for this memory.",
      });
    if (value.scope === "agent" && !value.agentId.trim())
      ctx.addIssue({
        code: "custom",
        path: ["agentId"],
        message: "Enter the agent ID for this memory.",
      });
  });

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load memories");
  return response.json();
};
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(payload?.message ?? payload?.error ?? "Request failed");
  }
  return response.json();
}
const scopeLabel: Record<MemoryScope, string> = {
  user: "Personal",
  organization: "Workspace",
  chat: "This chat",
  agent: "Agent",
};

function MemoryPageContent() {
  const {
    data: memories,
    error,
    mutate,
  } = useSWR<Memory[]>("/api/memories", fetcher);
  const { data: chatHistory } = useSWR<{ chats: ChatOption[] }>(
    "/api/history?limit=100",
    fetcher,
  );
  const { data: agents } = useSWR<AgentOption[]>(
    "/api/agent?limit=100",
    fetcher,
  );
  const { data: preference, mutate: mutatePreference } = useSWR<{
    savedMemoryEnabled: boolean;
    chatHistoryEnabled: boolean;
    automaticManagementEnabled: boolean;
    summary: string | null;
  }>("/api/memories/preferences", fetcher);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const filteredMemories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (memories ?? []).filter(
      (memory) =>
        !query ||
        `${memory.key} ${memory.content} ${scopeLabel[memory.scope]}`
          .toLowerCase()
          .includes(query),
    );
  }, [memories, search]);
  const updatePreference = async (
    key:
      | "savedMemoryEnabled"
      | "chatHistoryEnabled"
      | "automaticManagementEnabled",
    value: boolean,
  ) => {
    try {
      await request("/api/memories/preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      await mutatePreference();
    } catch (preferenceError) {
      toast.error(
        preferenceError instanceof Error
          ? preferenceError.message
          : "Unable to update memory settings",
      );
    }
  };
  const refreshSummary = async () => {
    try {
      await request("/api/memories/refresh", { method: "POST" });
      await mutatePreference();
      toast.success("Memory summary refreshed");
    } catch (summaryError) {
      toast.error(
        summaryError instanceof Error
          ? summaryError.message
          : "Unable to refresh memory summary",
      );
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = memoryFormSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        nextErrors[String(issue.path[0])] = issue.message;
      setFormErrors(nextErrors);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      await request("/api/memories", {
        method: "POST",
        body: JSON.stringify({
          ...parsed.data,
          chatId:
            parsed.data.scope === "chat"
              ? parsed.data.chatId.trim()
              : undefined,
          agentId:
            parsed.data.scope === "agent"
              ? parsed.data.agentId.trim()
              : undefined,
        }),
      });
      setForm(emptyForm);
      await mutate();
      toast.success("Memory saved");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save memory",
      );
    } finally {
      setSaving(false);
    }
  };
  const update = async (id: string) => {
    if (!editingContent.trim()) return;
    setSaving(true);
    try {
      await request(`/api/memories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editingContent.trim() }),
      });
      setEditingId(null);
      await mutate();
      toast.success("Memory updated");
    } catch (updateError) {
      toast.error(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update memory",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (memory: Memory) => {
    setDeleteTarget(memory);
  };
  const confirmRemove = async () => {
    if (!deleteTarget) return;
    try {
      await request(`/api/memories/${deleteTarget.id}`, { method: "DELETE" });
      await mutate();
      toast.success("Memory forgotten");
      setDeleteTarget(null);
    } catch (removeError) {
      toast.error(
        removeError instanceof Error
          ? removeError.message
          : "Unable to forget memory",
      );
    }
  };

  return (
    <>
      <WorkspaceShell
        activeSection="memory"
        description="Review and control the facts Circulo can remember across conversations."
        title="Memory"
      >
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Saved memories</CardTitle>
                <CardDescription>
                  {memories?.length ?? 0} memories available to this workspace.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search memories"
                  className="pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search memories"
                  value={search}
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {filteredMemories.map((memory) => (
                <div
                  className="flex items-start gap-3 rounded-xl border p-3"
                  key={memory.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{memory.key}</span>
                      <Badge variant="secondary">
                        {scopeLabel[memory.scope]}
                      </Badge>
                    </div>
                    {editingId === memory.id ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <Textarea
                          aria-label={`Edit ${memory.key}`}
                          onChange={(event) =>
                            setEditingContent(event.target.value)
                          }
                          value={editingContent}
                        />
                        <div className="flex gap-2">
                          <Button
                            disabled={saving || !editingContent.trim()}
                            onClick={() => void update(memory.id)}
                            size="sm"
                          >
                            <Check data-icon="inline-start" /> Save
                          </Button>
                          <Button
                            onClick={() => setEditingId(null)}
                            size="sm"
                            variant="ghost"
                          >
                            <X data-icon="inline-start" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                        {memory.content}
                      </p>
                    )}
                  </div>
                  {editingId !== memory.id && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        aria-label={`Edit ${memory.key}`}
                        onClick={() => {
                          setEditingId(memory.id);
                          setEditingContent(memory.content);
                        }}
                        size="icon"
                        variant="ghost"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        aria-label={`Forget ${memory.key}`}
                        onClick={() => void remove(memory)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!filteredMemories.length && (
                <Empty className="min-h-48 border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Brain />
                    </EmptyMedia>
                    <EmptyTitle>
                      {search ? "No matching memories" : "No memories saved"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {search
                        ? "Try a different search."
                        : "Add a memory when a fact should persist across conversations."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Remember something</CardTitle>
              <CardDescription>
                Use a clear key and a single durable fact or preference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-5" onSubmit={save}>
                <FieldGroup>
                  <Field data-invalid={Boolean(formErrors.scope)}>
                    <FieldLabel htmlFor="memory-scope">
                      Where should it apply?
                    </FieldLabel>
                    <Select
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          scope: value as MemoryScope,
                          chatId: "",
                          agentId: "",
                        }))
                      }
                      value={form.scope}
                    >
                      <SelectTrigger
                        aria-invalid={Boolean(formErrors.scope)}
                        id="memory-scope"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="user">Personal</SelectItem>
                          <SelectItem value="organization">
                            Workspace
                          </SelectItem>
                          <SelectItem value="chat">This chat</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {formErrors.scope && (
                      <FieldError>{formErrors.scope}</FieldError>
                    )}
                  </Field>
                  {form.scope === "chat" && (
                    <Field data-invalid={Boolean(formErrors.chatId)}>
                      <FieldLabel>Chat</FieldLabel>
                      <Select
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            chatId: value ?? "",
                          }))
                        }
                        value={form.chatId || undefined}
                      >
                        <SelectTrigger
                          aria-invalid={Boolean(formErrors.chatId)}
                        >
                          <SelectValue placeholder="Choose a chat" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {(chatHistory?.chats ?? []).map((chat) => (
                              <SelectItem key={chat.id} value={chat.id}>
                                {chat.title}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {/* The validation message explains why a choice is required. */}
                      {!chatHistory?.chats?.length && (
                        <FieldDescription>
                          No chats are available.
                        </FieldDescription>
                      )}
                      {formErrors.chatId && (
                        <FieldError>{formErrors.chatId}</FieldError>
                      )}
                    </Field>
                  )}
                  {form.scope === "agent" && (
                    <Field data-invalid={Boolean(formErrors.agentId)}>
                      <FieldLabel>Agent</FieldLabel>
                      <Select
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            agentId: value ?? "",
                          }))
                        }
                        value={form.agentId || undefined}
                      >
                        <SelectTrigger
                          aria-invalid={Boolean(formErrors.agentId)}
                        >
                          <SelectValue placeholder="Choose an agent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {(agents ?? []).map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                                {agent.model ? ` · ${agent.model}` : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {!agents?.length && (
                        <FieldDescription>
                          No agents are available.
                        </FieldDescription>
                      )}
                      {formErrors.agentId && (
                        <FieldError>{formErrors.agentId}</FieldError>
                      )}
                    </Field>
                  )}
                  <Field data-invalid={Boolean(formErrors.key)}>
                    <FieldLabel htmlFor="memory-key">Memory name</FieldLabel>
                    <Input
                      aria-invalid={Boolean(formErrors.key)}
                      id="memory-key"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          key: event.target.value,
                        }))
                      }
                      placeholder="Preferred writing style"
                      value={form.key}
                    />
                    {formErrors.key && (
                      <FieldError>{formErrors.key}</FieldError>
                    )}
                  </Field>
                  <Field data-invalid={Boolean(formErrors.content)}>
                    <FieldLabel htmlFor="memory-content">
                      What should be remembered?
                    </FieldLabel>
                    <FieldDescription>
                      Write it as a fact, not as a command.
                    </FieldDescription>
                    <Textarea
                      aria-invalid={Boolean(formErrors.content)}
                      className="min-h-28"
                      id="memory-content"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          content: event.target.value,
                        }))
                      }
                      placeholder="The team prefers concise weekly updates."
                      value={form.content}
                    />
                    {formErrors.content && (
                      <FieldError>{formErrors.content}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
                <Button disabled={saving} type="submit">
                  <Plus data-icon="inline-start" />{" "}
                  {saving ? "Saving…" : "Save memory"}
                </Button>
              </form>
              <div className="mt-6 border-t pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Personalization controls</p>
                    <p className="text-sm text-muted-foreground">
                      Control what can shape future replies.
                    </p>
                  </div>
                  <Button
                    onClick={() => void refreshSummary()}
                    size="sm"
                    variant="outline"
                  >
                    Refresh summary
                  </Button>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <label className="flex items-start gap-2">
                    <Checkbox
                      checked={preference?.savedMemoryEnabled ?? true}
                      onCheckedChange={(checked) =>
                        void updatePreference(
                          "savedMemoryEnabled",
                          checked === true,
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">
                        Reference saved memories
                      </span>
                      <span className="block text-muted-foreground">
                        Use personal facts across conversations.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <Checkbox
                      checked={preference?.chatHistoryEnabled ?? true}
                      onCheckedChange={(checked) =>
                        void updatePreference(
                          "chatHistoryEnabled",
                          checked === true,
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">
                        Reference chat history
                      </span>
                      <span className="block text-muted-foreground">
                        Allow relevant past chat context to be considered.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <Checkbox
                      checked={preference?.automaticManagementEnabled ?? true}
                      onCheckedChange={(checked) =>
                        void updatePreference(
                          "automaticManagementEnabled",
                          checked === true,
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">
                        Automatically manage memories
                      </span>
                      <span className="block text-muted-foreground">
                        Keep the summary current as memories change.
                      </span>
                    </span>
                  </label>
                </div>
                {preference?.summary && (
                  <p className="mt-4 max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                    {preference.summary}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </WorkspaceShell>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget {deleteTarget?.key}?</AlertDialogTitle>
            <AlertDialogDescription>
              This saved memory will be removed from future context.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmRemove();
              }}
            >
              Forget memory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function MemoryPage() {
  return (
    <RequireSession>
      <MemoryPageContent />
    </RequireSession>
  );
}
