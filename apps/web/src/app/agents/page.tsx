"use client";

import { RequireSession } from "@/components/auth/require-session";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { FormRoot } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { defaultModelForProvider } from "@/lib/ai-providers";
import { createAgentBodySchema } from "@circulo-ai/types";
import { ArrowLeft, Bot, Pencil, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  model: string;
  providerId: string;
  maxTokens: number | null;
  temperature: number | null;
  defaultKnowledgeBaseIds: string[];
  toolAccessMode: "all" | "allowlist";
  defaultToolIds: string[];
};
type KnowledgeBase = { id: string; name: string };
type Capability = {
  id: string;
  name: string;
  description: string;
  status: string;
  tools: string[];
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Unable to load workspace resources. Please try again.");
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
  providerId: "openrouter",
  model: "openrouter/free",
  maxTokens: "1000",
  temperature: "70",
  defaultKnowledgeBaseIds: [] as string[],
  toolAccessMode: "allowlist" as "all" | "allowlist",
  defaultToolIds: [] as string[],
};

function formForAgent(agent: Agent) {
  return {
    name: agent.name,
    description: agent.description ?? "",
    instructions: agent.instructions,
    providerId: agent.providerId ?? "openrouter",
    model: agent.model,
    maxTokens: String(agent.maxTokens ?? 1000),
    temperature: String(agent.temperature ?? 70),
    defaultKnowledgeBaseIds: agent.defaultKnowledgeBaseIds ?? [],
    toolAccessMode: agent.toolAccessMode ?? "allowlist",
    defaultToolIds: agent.defaultToolIds ?? [],
  };
}

function AgentsPageContent() {
  const {
    data: agents,
    error,
    isLoading,
    mutate,
  } = useSWR<Agent[]>("/api/agent?limit=100", fetcher);
  const {
    data: knowledgeBases,
    error: knowledgeError,
    isLoading: knowledgeLoading,
    mutate: retryKnowledge,
  } = useSWR<KnowledgeBase[]>("/api/knowledge-bases", fetcher);
  const {
    data: capabilityData,
    error: capabilityError,
    isLoading: capabilitiesLoading,
    mutate: retryCapabilities,
  } = useSWR<{ plugins: Capability[]; apps: Capability[] }>(
    "/api/capabilities",
    fetcher,
  );
  const { data: providerData, error: providerError } = useSWR<{
    providers: Array<{ id: string; name: string }>;
    credentials: Array<{ providerId: string }>;
  }>("/api/ai-providers", fetcher);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [archiveAgent, setArchiveAgent] = useState<Agent>();
  const [archiving, setArchiving] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [generationOpen, setGenerationOpen] = useState<string[]>([]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const {
    data: modelData,
    error: modelError,
    isLoading: modelsLoading,
  } = useSWR<{ models: Array<{ id: string; name: string }> }>(
    editorOpen
      ? `/api/models?providerId=${encodeURIComponent(form.providerId)}&toolsOnly=true`
      : null,
    fetcher,
    { shouldRetryOnError: false },
  );
  useEffect(() => {
    if (
      editingId ||
      !modelData?.models.length ||
      modelData.models.some((model) => model.id === form.model)
    )
      return;
    setForm((current) => ({ ...current, model: modelData.models[0].id }));
  }, [editingId, form.model, modelData]);

  const providers = useMemo(() => {
    const connected = new Set(
      providerData?.credentials.map((item) => item.providerId),
    );
    const available = (providerData?.providers ?? []).filter(
      (provider) =>
        provider.id === "openrouter" ||
        connected.has(provider.id) ||
        provider.id === form.providerId,
    );
    return available.length
      ? available
      : [{ id: "openrouter", name: "OpenRouter" }];
  }, [providerData, form.providerId]);
  const providerItems = providers.map((provider) => ({
    value: provider.id,
    label: provider.name,
  }));
  const models = useMemo(() => {
    const available = modelData?.models ?? [];
    if (!available.some((model) => model.id === form.model)) {
      return [
        {
          id: form.model,
          name:
            form.model === "openrouter/free"
              ? "OpenRouter Free Router"
              : form.model,
        },
        ...available,
      ];
    }
    return available;
  }, [modelData, form.model]);
  const modelItems = models.map((model) => ({
    value: model.id,
    label: model.name,
  }));
  const capabilities = useMemo(
    () => [...(capabilityData?.plugins ?? []), ...(capabilityData?.apps ?? [])],
    [capabilityData],
  );
  const filteredCapabilities = capabilities.filter((item) =>
    `${item.name} ${item.description}`
      .toLowerCase()
      .includes(toolSearch.toLowerCase()),
  );

  const openEditor = (agent?: Agent) => {
    const next = agent ? formForAgent(agent) : emptyForm;
    setEditingId(agent?.id);
    setForm(next);
    setInitialForm(next);
    setFieldErrors({});
    setSaveError("");
    setToolSearch("");
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(undefined);
    setDiscardOpen(false);
  };
  const cancel = () => {
    if (dirty) setDiscardOpen(true);
    else closeEditor();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const parsed = createAgentBodySchema.safeParse({
      ...form,
      name: form.name.trim(),
      instructions: form.instructions.trim(),
      description: form.description.trim() || undefined,
      maxTokens: Number(form.maxTokens),
      temperature: form.temperature.trim()
        ? Number(form.temperature)
        : Number.NaN,
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        nextErrors[String(issue.path[0])] ??= issue.message;
      setFieldErrors(nextErrors);
      setSaveError("Review the highlighted fields before saving.");
      if (nextErrors.maxTokens || nextErrors.temperature)
        setGenerationOpen(["generation"]);
      requestAnimationFrame(() =>
        document
          .getElementById(`agent-${String(parsed.error.issues[0]?.path[0])}`)
          ?.focus(),
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFieldErrors({});
    setSaveError("");
    try {
      await request("/api/agent", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(
          editingId ? { id: editingId, ...parsed.data } : parsed.data,
        ),
      });
      toast.success(editingId ? "Agent updated" : "Agent created");
      closeEditor();
      await mutate();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save this agent. Please try again.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!archiveAgent || archiving) return;
    setArchiving(true);
    try {
      await request(`/api/agent/${archiveAgent.id}`, { method: "DELETE" });
      await mutate();
      toast.success("Agent archived");
      setArchiveAgent(undefined);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to archive agent",
      );
    } finally {
      setArchiving(false);
    }
  };
  const toggleSelection = (
    key: "defaultKnowledgeBaseIds" | "defaultToolIds",
    id: string,
    checked: boolean,
  ) => {
    setForm((current) => ({
      ...current,
      [key]: checked
        ? [...new Set([...current[key], id])]
        : current[key].filter((item) => item !== id),
    }));
  };

  return (
    <WorkspaceShell
      activeSection="agents"
      title={editorOpen ? (editingId ? "Edit agent" : "New agent") : "Agents"}
      description={
        editorOpen
          ? "Define how this agent works, the model it uses, and the resources it can access."
          : "Manage the agents available to your workspace chats."
      }
      actions={
        !editorOpen && (
          <Button onClick={() => openEditor()}>
            <Plus data-icon="inline-start" />
            New agent
          </Button>
        )
      }
    >
      {editorOpen ? (
        <div className="flex flex-col gap-6">
          <Button
            className="self-start"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={cancel}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to agents
          </Button>
          <FormRoot
            id="workspace-agent-form"
            className="flex flex-col gap-6 pb-4"
            onSubmit={save}
            aria-busy={saving}
            noValidate
          >
            {saveError && (
              <Alert variant="destructive">
                <AlertTitle>Agent not saved</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
              <FieldSet>
                <FieldLegend>Identity & instructions</FieldLegend>
                <FieldGroup>
                  <Field data-invalid={Boolean(fieldErrors.name)}>
                    <FieldLabel htmlFor="agent-name">Name</FieldLabel>
                    <Input
                      id="agent-name"
                      autoFocus
                      disabled={saving}
                      aria-invalid={Boolean(fieldErrors.name)}
                      maxLength={200}
                      placeholder="Research lead"
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    {fieldErrors.name && (
                      <FieldError>{fieldErrors.name}</FieldError>
                    )}
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
                      disabled={saving}
                      placeholder="What this agent is best at"
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                    <FieldDescription>
                      A short description helps teammates choose the right
                      agent.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={Boolean(fieldErrors.instructions)}>
                    <FieldLabel htmlFor="agent-instructions">
                      Instructions
                    </FieldLabel>
                    <FieldDescription>
                      Describe its role, approach, and any rules it should
                      follow in a shared chat.
                    </FieldDescription>
                    <Textarea
                      id="agent-instructions"
                      className="min-h-64 resize-y"
                      disabled={saving}
                      aria-invalid={Boolean(fieldErrors.instructions)}
                      placeholder="You are the research lead…"
                      value={form.instructions}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          instructions: event.target.value,
                        }))
                      }
                    />
                    {fieldErrors.instructions && (
                      <FieldError>{fieldErrors.instructions}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
              </FieldSet>
              <div className="flex min-w-0 flex-col gap-6">
                <FieldSet>
                  <FieldLegend>Model</FieldLegend>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="agent-providerId">
                        Provider
                      </FieldLabel>
                      <Select
                        items={providerItems}
                        disabled={saving}
                        value={form.providerId}
                        onValueChange={(value) => {
                          if (value)
                            setForm((current) => ({
                              ...current,
                              providerId: value,
                              model: defaultModelForProvider(value),
                            }));
                        }}
                      >
                        <SelectTrigger id="agent-providerId" className="w-full">
                          <SelectValue placeholder="Choose a provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {providers.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Connected providers use your key and do not consume
                        Circulo AI credits.
                      </FieldDescription>
                      {providerError && (
                        <FieldError>
                          Provider connections could not be loaded. Your current
                          selection is retained.
                        </FieldError>
                      )}
                    </Field>
                    <Field data-invalid={Boolean(fieldErrors.model)}>
                      <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                      <Select
                        items={modelItems}
                        disabled={saving || modelsLoading}
                        value={form.model}
                        onValueChange={(value) => {
                          if (value)
                            setForm((current) => ({
                              ...current,
                              model: value,
                            }));
                        }}
                      >
                        <SelectTrigger
                          id="agent-model"
                          className="w-full"
                          aria-invalid={Boolean(fieldErrors.model)}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {modelsLoading && (
                        <FieldDescription>
                          Loading available models…
                        </FieldDescription>
                      )}
                      {modelError && (
                        <FieldError>
                          Models could not be loaded. Your current model is
                          retained.
                        </FieldError>
                      )}
                      {fieldErrors.model && (
                        <FieldError>{fieldErrors.model}</FieldError>
                      )}
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <Accordion
                  value={generationOpen}
                  onValueChange={setGenerationOpen}
                >
                  <AccordionItem value="generation">
                    <AccordionTrigger>Generation settings</AccordionTrigger>
                    <AccordionContent>
                      <FieldGroup>
                        <Field data-invalid={Boolean(fieldErrors.maxTokens)}>
                          <FieldLabel htmlFor="agent-maxTokens">
                            Maximum output tokens
                          </FieldLabel>
                          <Input
                            id="agent-maxTokens"
                            disabled={saving}
                            type="number"
                            min={1}
                            step={1}
                            aria-invalid={Boolean(fieldErrors.maxTokens)}
                            value={form.maxTokens}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                maxTokens: event.target.value,
                              }))
                            }
                          />
                          <FieldDescription>
                            Limits the length of each response.
                          </FieldDescription>
                          {fieldErrors.maxTokens && (
                            <FieldError>{fieldErrors.maxTokens}</FieldError>
                          )}
                        </Field>
                        <Field data-invalid={Boolean(fieldErrors.temperature)}>
                          <FieldLabel htmlFor="agent-temperature">
                            Temperature
                          </FieldLabel>
                          <Input
                            id="agent-temperature"
                            disabled={saving}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            aria-invalid={Boolean(fieldErrors.temperature)}
                            value={form.temperature}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                temperature: event.target.value,
                              }))
                            }
                          />
                          <FieldDescription>
                            0–100. Lower values are more focused; higher values
                            allow more variation.
                          </FieldDescription>
                          {fieldErrors.temperature && (
                            <FieldError>{fieldErrors.temperature}</FieldError>
                          )}
                        </Field>
                      </FieldGroup>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
            <Accordion multiple>
              <AccordionItem value="knowledge">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    Knowledge bases{" "}
                    <Badge variant="secondary">
                      {form.defaultKnowledgeBaseIds.length} selected
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <FieldSet>
                    <FieldLegend className="sr-only">
                      Knowledge bases
                    </FieldLegend>
                    <FieldDescription>
                      Give this agent reference material from the workspace.
                    </FieldDescription>
                    {knowledgeLoading ? (
                      <Skeleton className="h-12 w-full" />
                    ) : knowledgeError ? (
                      <Alert>
                        <AlertDescription>
                          Knowledge bases could not be loaded.{" "}
                          <Button
                            variant="link"
                            onClick={() => void retryKnowledge()}
                          >
                            Try again
                          </Button>
                        </AlertDescription>
                      </Alert>
                    ) : knowledgeBases?.length ? (
                      <FieldGroup className="gap-3">
                        {knowledgeBases.map((base) => (
                          <Field key={base.id} orientation="horizontal">
                            <Checkbox
                              id={`agent-kb-${base.id}`}
                              disabled={saving}
                              checked={form.defaultKnowledgeBaseIds.includes(
                                base.id,
                              )}
                              onCheckedChange={(checked) =>
                                toggleSelection(
                                  "defaultKnowledgeBaseIds",
                                  base.id,
                                  checked === true,
                                )
                              }
                            />
                            <FieldLabel htmlFor={`agent-kb-${base.id}`}>
                              {base.name}
                            </FieldLabel>
                          </Field>
                        ))}
                      </FieldGroup>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No knowledge bases yet.{" "}
                        <Link
                          className="underline underline-offset-4"
                          href="/knowledge"
                        >
                          Manage knowledge bases
                        </Link>
                      </p>
                    )}
                  </FieldSet>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="tools">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    Tool access{" "}
                    <Badge variant="secondary">
                      {form.toolAccessMode === "all"
                        ? "All available"
                        : `${form.defaultToolIds.length} selected`}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <FieldSet>
                    <FieldLegend className="sr-only">Tool access</FieldLegend>
                    <FieldDescription>
                      Workspace permissions and approval rules still apply to
                      every tool call.
                    </FieldDescription>
                    <RadioGroup
                      value={form.toolAccessMode}
                      disabled={saving}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          toolAccessMode: value === "all" ? "all" : "allowlist",
                        }))
                      }
                      aria-label="Tool access mode"
                    >
                      <Field orientation="horizontal">
                        <RadioGroupItem
                          id="agent-tool-selected"
                          value="allowlist"
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="agent-tool-selected">
                            Selected capabilities
                          </FieldLabel>
                          <FieldDescription>
                            Only the capabilities you choose below.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                      <Field orientation="horizontal">
                        <RadioGroupItem id="agent-tool-all" value="all" />
                        <FieldContent>
                          <FieldLabel htmlFor="agent-tool-all">
                            All available capabilities
                          </FieldLabel>
                          <FieldDescription>
                            Includes tools connected in the future. Choose this
                            only for an agent trusted to use them.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    </RadioGroup>
                    {form.toolAccessMode === "allowlist" && (
                      <>
                        <Input
                          aria-label="Search agent capabilities"
                          placeholder="Search capabilities…"
                          value={toolSearch}
                          onChange={(event) =>
                            setToolSearch(event.target.value)
                          }
                        />
                        {capabilitiesLoading ? (
                          <Skeleton className="h-12 w-full" />
                        ) : capabilityError ? (
                          <Alert>
                            <AlertDescription>
                              Capabilities could not be loaded.{" "}
                              <Button
                                variant="link"
                                onClick={() => void retryCapabilities()}
                              >
                                Try again
                              </Button>
                            </AlertDescription>
                          </Alert>
                        ) : filteredCapabilities.length ? (
                          <FieldGroup className="max-h-72 gap-3 overflow-y-auto">
                            {filteredCapabilities.map((item) => (
                              <Field key={item.id} orientation="horizontal">
                                <Checkbox
                                  id={`agent-tool-${item.id}`}
                                  disabled={saving}
                                  checked={form.defaultToolIds.includes(
                                    item.id,
                                  )}
                                  onCheckedChange={(checked) =>
                                    toggleSelection(
                                      "defaultToolIds",
                                      item.id,
                                      checked === true,
                                    )
                                  }
                                />
                                <FieldContent>
                                  <FieldLabel htmlFor={`agent-tool-${item.id}`}>
                                    {item.name}
                                  </FieldLabel>
                                  <FieldDescription>
                                    {item.description}
                                  </FieldDescription>
                                </FieldContent>
                              </Field>
                            ))}
                          </FieldGroup>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {capabilities.length
                              ? "No capabilities match your search."
                              : "No capabilities are available in this workspace."}
                          </p>
                        )}
                      </>
                    )}
                  </FieldSet>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <div className="sticky -bottom-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4">
              <p className="text-sm text-muted-foreground">
                {dirty
                  ? "Unsaved changes"
                  : editingId
                    ? "No changes yet"
                    : "Agents are available to workspace chats after you save."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={saving} onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || modelsLoading}>
                  {saving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  {saving
                    ? "Saving…"
                    : editingId
                      ? "Save changes"
                      : "Create agent"}
                </Button>
              </div>
            </div>
          </FormRoot>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Agents unavailable</AlertTitle>
          <AlertDescription>
            {error.message}
            <Button variant="outline" onClick={() => void mutate()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-24 w-full" key={index} />
          ))}
        </div>
      ) : !agents?.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot />
            </EmptyMedia>
            <EmptyTitle>No agents yet</EmptyTitle>
            <EmptyDescription>
              Create an agent to give your workspace a specialist with its own
              instructions, model, and tools.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col divide-y rounded-xl border">
          {agents.map((agent) => (
            <div
              className="flex min-w-0 items-start gap-3 p-4 sm:items-center sm:gap-4"
              key={agent.id}
            >
              <Avatar>
                <AvatarFallback>
                  {agent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{agent.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {agent.description || agent.instructions}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {providerData?.providers.find(
                      (provider) => provider.id === agent.providerId,
                    )?.name ?? agent.providerId}
                  </Badge>
                  <span
                    className="max-w-full truncate text-xs text-muted-foreground"
                    title={agent.model}
                  >
                    {agent.model}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  aria-label={`Edit ${agent.name}`}
                  onClick={() => openEditor(agent)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Pencil />
                </Button>
                <Button
                  aria-label={`Archive ${agent.name}`}
                  onClick={() => setArchiveAgent(agent)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this agent have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={closeEditor}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(archiveAgent)}
        onOpenChange={(open) => {
          if (!open && !archiving) setArchiveAgent(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveAgent?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This agent will no longer be available for new work. Its existing
              chat history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={archiving}
              onClick={() => void remove()}
            >
              {archiving && <Spinner data-icon="inline-start" />}Archive agent
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
