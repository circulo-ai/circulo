"use client";

import { RequireSession } from "@/components/auth/require-session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  model: string;
  maxTokens: number | null;
  temperature: number | null;
  defaultKnowledgeBaseIds: string[];
  toolAccessMode: "all" | "allowlist";
  defaultToolIds: string[];
};

type KnowledgeBase = { id: string; name: string };
type CapabilityPlugin = {
  id: string;
  name: string;
  description: string;
  status: string;
  tools: string[];
};
type CapabilityApp = Omit<CapabilityPlugin, "status"> & {
  type: "app";
  status: string;
  accountLabel: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load agents");
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

const emptyForm = {
  name: "",
  description: "",
  instructions: "",
  model: "openrouter/free",
  maxTokens: "1000",
  temperature: "70",
  defaultKnowledgeBaseIds: [] as string[],
  toolAccessMode: "allowlist" as "all" | "allowlist",
  defaultToolIds: [] as string[],
};

function AgentsPageContent() {
  const {
    data: agents,
    error,
    mutate,
  } = useSWR<Agent[]>("/api/agent?limit=100", fetcher);
  const { data: knowledgeBases } = useSWR<KnowledgeBase[]>(
    "/api/knowledge-bases",
    fetcher,
  );
  const { data: capabilityData } = useSWR<{
    plugins: CapabilityPlugin[];
    apps: CapabilityApp[];
  }>("/api/capabilities", fetcher);
  const selectablePlugins = useMemo(
    () => [...(capabilityData?.plugins ?? []), ...(capabilityData?.apps ?? [])],
    [capabilityData?.apps, capabilityData?.plugins],
  );
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!editingId) return;
    const agent = agents?.find((item) => item.id === editingId);
    if (!agent) return;
    setForm({
      name: agent.name,
      description: agent.description ?? "",
      instructions: agent.instructions,
      model: agent.model,
      maxTokens: String(agent.maxTokens ?? 1000),
      temperature: String(agent.temperature ?? 70),
      defaultKnowledgeBaseIds: agent.defaultKnowledgeBaseIds ?? [],
      toolAccessMode: agent.toolAccessMode ?? "allowlist",
      defaultToolIds: agent.defaultToolIds ?? [],
    });
  }, [agents, editingId]);

  const save = async () => {
    if (!form.name.trim() || !form.instructions.trim()) {
      setFormError("Add an agent name and clear operating instructions.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        instructions: form.instructions,
        model: form.model,
        maxTokens: Number(form.maxTokens),
        temperature: Number(form.temperature),
        toolAccessMode: form.toolAccessMode,
        defaultKnowledgeBaseIds: form.defaultKnowledgeBaseIds,
        defaultToolIds: form.defaultToolIds,
      };
      await request(editingId ? "/api/agent" : "/api/agent", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(editingId ? { id: editingId, ...body } : body),
      });
      setEditingId(undefined);
      setForm(emptyForm);
      await mutate();
      toast.success(editingId ? "Agent updated" : "Agent created");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Unable to save agent",
      );
    } finally {
      setSaving(false);
    }
  };
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  const remove = async (id: string) => {
    try {
      await request(`/api/agent/${id}`, { method: "DELETE" });
      await mutate();
      if (editingId === id) {
        setEditingId(undefined);
        setForm(emptyForm);
      }
    } catch (removeError) {
      toast.error(
        removeError instanceof Error
          ? removeError.message
          : "Unable to archive agent",
      );
    }
  };

  return (
    <WorkspaceShell
      activeSection="agents"
      description="Manage the agents available to your workspace chats."
      title="Agents"
    >
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Workspace agents</h2>
            <Button
              onClick={() => {
                setEditingId(undefined);
                setForm(emptyForm);
              }}
            >
              <Plus className="mr-2 size-4" />
              New agent
            </Button>
          </div>
          {(agents ?? []).map((agent) => (
            <div
              className="flex items-center justify-between rounded-lg border p-3"
              key={agent.id}
            >
              <div className="min-w-0">
                <div className="font-medium">{agent.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {agent.model}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {agent.description || agent.instructions}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  aria-label={`Edit ${agent.name}`}
                  onClick={() => setEditingId(agent.id)}
                  size="icon"
                  variant="ghost"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  aria-label={`Archive ${agent.name}`}
                  onClick={() => void remove(agent.id)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {!agents?.length && (
            <p className="text-sm text-muted-foreground">No agents yet.</p>
          )}
        </section>
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-medium">
            {editingId ? "Edit agent" : "New agent"}
          </h2>
          <form className="flex flex-col gap-4" onSubmit={submitForm}>
            <FieldGroup>
              <Field data-invalid={Boolean(formError)}>
                <FieldLabel htmlFor="agent-name">Name</FieldLabel>
                <Input
                  aria-invalid={Boolean(formError)}
                  id="agent-name"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Research lead"
                  value={form.name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-description">
                  Description{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  id="agent-description"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="What this agent is best at"
                  value={form.description}
                />
              </Field>
              <Field data-invalid={Boolean(formError)}>
                <FieldLabel htmlFor="agent-instructions">
                  Instructions
                </FieldLabel>
                <FieldDescription>
                  These instructions define how the agent behaves in a shared
                  chat.
                </FieldDescription>
                <Textarea
                  aria-invalid={Boolean(formError)}
                  className="min-h-32"
                  id="agent-instructions"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                  placeholder="You are the research lead…"
                  value={form.instructions}
                />
                {formError && <FieldError>{formError}</FieldError>}
              </Field>
              <Field>
                <FieldLabel>Model</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      model: value ?? current.model,
                    }))
                  }
                  value={form.model}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="openai/gpt-4o-mini">
                        GPT-4o mini
                      </SelectItem>
                      <SelectItem value="openrouter/free">
                        OpenRouter Free Router
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="agent-max-tokens">Max tokens</FieldLabel>
                  <Input
                    id="agent-max-tokens"
                    min={1}
                    type="number"
                    value={form.maxTokens}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maxTokens: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="agent-temperature">
                    Temperature
                  </FieldLabel>
                  <Input
                    id="agent-temperature"
                    max={100}
                    min={0}
                    type="number"
                    value={form.temperature}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        temperature: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel>Knowledge bases</FieldLabel>
                {(knowledgeBases ?? []).map((base) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={base.id}
                  >
                    <Checkbox
                      checked={form.defaultKnowledgeBaseIds.includes(base.id)}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          defaultKnowledgeBaseIds: checked
                            ? [...current.defaultKnowledgeBaseIds, base.id]
                            : current.defaultKnowledgeBaseIds.filter(
                                (id) => id !== base.id,
                              ),
                        }))
                      }
                    />
                    {base.name}
                  </label>
                ))}
                {!knowledgeBases?.length && (
                  <FieldDescription>
                    Create a knowledge base first.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel>Tool access</FieldLabel>
                <FieldDescription>
                  Choose exactly which capabilities this agent may use.
                  Allowlist mode is the safe default; every tool call is still
                  subject to workspace permissions and approval rules.
                </FieldDescription>
                <div className="space-y-2 rounded-lg border p-3">
                  <label className="flex items-start gap-2 border-b pb-3 text-sm">
                    <Checkbox
                      checked={form.toolAccessMode === "all"}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          toolAccessMode: checked ? "all" : "allowlist",
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">
                        Allow all available capabilities
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Use only for agents that are explicitly trusted to
                        access newly connected tools.
                      </span>
                    </span>
                  </label>
                  {selectablePlugins.map((plugin) => (
                    <label
                      className="flex items-start gap-2 text-sm"
                      key={plugin.id}
                    >
                      <Checkbox
                        checked={form.defaultToolIds.includes(plugin.id)}
                        disabled={form.toolAccessMode === "all"}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            defaultToolIds: checked
                              ? [...current.defaultToolIds, plugin.id]
                              : current.defaultToolIds.filter(
                                  (id) => id !== plugin.id,
                                ),
                          }))
                        }
                      />
                      <span>
                        <span className="font-medium">{plugin.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {plugin.description}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!selectablePlugins.length && (
                    <FieldDescription>
                      Capabilities will appear after the workspace loads.
                    </FieldDescription>
                  )}
                </div>
              </Field>
            </FieldGroup>
            <Button disabled={saving} type="submit">
              <Save data-icon="inline-start" />{" "}
              {saving ? "Saving…" : "Save agent"}
            </Button>
          </form>
        </section>
      </div>
    </WorkspaceShell>
  );
}

export default function AgentsPage() {
  return (
    <RequireSession>
      <AgentsPageContent />
    </RequireSession>
  );
}
