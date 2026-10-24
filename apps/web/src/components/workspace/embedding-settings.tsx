"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { FormRoot } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/auth-client";
import {
  EMBEDDING_MODELS,
  embeddingPreferencesSchema,
  type EmbeddingPreferences,
} from "@circulo-ai/types";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import useSWR from "swr";

type Settings = {
  config: EmbeddingPreferences;
  canManage: boolean;
  canReindexKnowledge: boolean;
  configured: boolean;
  documents: { total: number; pending: number };
  memories: { total: number; pending: number };
};
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload.message ?? payload.error ?? "The request could not be completed",
    );
  return payload;
}

export function EmbeddingSettings() {
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId;
  const { data, error, mutate } = useSWR<Settings>(
    organizationId ? ["embedding-settings", organizationId] : null,
    () => request("/api/embedding-settings"),
    {
      refreshInterval: (latest) =>
        latest?.configured &&
        (latest.documents.pending > 0 || latest.memories.pending > 0)
          ? 10000
          : 0,
    },
  );
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Indexing settings could not be loaded</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <Button size="sm" variant="outline" onClick={() => void mutate()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!data) return <Skeleton className="h-14 w-full" />;
  return (
    <EmbeddingSettingsForm
      key={organizationId}
      data={data}
      refresh={() => mutate()}
    />
  );
}

function EmbeddingSettingsForm({
  data,
  refresh,
}: {
  data: Settings;
  refresh: () => Promise<unknown>;
}) {
  const id = useId();
  const [draft, setDraft] = useState(data.config);
  const [size, setSize] = useState(String(data.config.chunkSize));
  const [overlap, setOverlap] = useState(String(data.config.overlap));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<
    "save" | "test" | "knowledge" | "memory" | null
  >(null);
  const [processed, setProcessed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const parsedDraft = () => {
    const parsed = embeddingPreferencesSchema.safeParse({
      ...draft,
      chunkSize: Number(size),
      overlap: Number(overlap),
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return null;
    }
    setErrors({});
    return parsed.data;
  };
  const run = async (action: "save" | "test" | "knowledge" | "memory") => {
    if (busy) return;
    const config = parsedDraft();
    if (!config) return;
    setError("");
    setNotice("");
    setBusy(action);
    setProcessed(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (action === "test") {
        await request("/api/embedding-settings/test", {
          method: "POST",
          body: JSON.stringify(config),
          signal: controller.signal,
        });
        setNotice(
          "Connection verified. The provider returned a valid 1,536-dimension embedding.",
        );
      } else if (action === "save") {
        const result = await request<{ reindexRequired: boolean }>(
          "/api/embedding-settings",
          {
            method: "PATCH",
            body: JSON.stringify(config),
            signal: controller.signal,
          },
        );
        setNotice(
          result.reindexRequired
            ? "Settings saved. Rebuild knowledge and memory indexes to apply them. Text search remains available."
            : "Indexing settings saved.",
        );
        await refresh();
      } else {
        let cursor: string | undefined;
        let total = 0;
        let indexed = 0;
        let failed = 0;
        let firstFailure = "";
        do {
          const result = await request<{
            indexed: number;
            processed: number;
            cursor?: string;
            done: boolean;
            failures: Array<{ message: string }>;
          }>("/api/embedding-settings/reindex", {
            method: "POST",
            body: JSON.stringify({ kind: action, cursor, limit: 1 }),
            signal: controller.signal,
          });
          total += result.processed;
          indexed += result.indexed;
          failed += result.failures.length;
          firstFailure ||= result.failures[0]?.message ?? "";
          setProcessed(total);
          if (result.done) break;
          if (!result.cursor || result.cursor === cursor)
            throw new Error("Index rebuild could not advance. Please retry.");
          cursor = result.cursor;
        } while (!controller.signal.aborted);
        if (failed)
          setError(
            `${indexed} of ${total} sources indexed; ${failed} require a retry. ${firstFailure}`,
          );
        else
          setNotice(
            `${indexed} ${action === "knowledge" ? "documents" : "memories"} indexed successfully.`,
          );
        await refresh();
      }
    } catch (failure) {
      if (controller.signal.aborted)
        setNotice(
          "Rebuild stopped. Completed sources are saved; you can rebuild again.",
        );
      else
        setError(
          failure instanceof Error
            ? failure.message
            : "Indexing operation failed",
        );
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  };
  const providers = [
    { value: "auto", label: "Automatic (based on model)" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "openai", label: "OpenAI" },
    { value: "google", label: "Google AI" },
  ];
  const compatibleModels = EMBEDDING_MODELS.filter(
    (model) =>
      draft.provider === "auto" ||
      model.provider === (draft.provider === "google" ? "google" : "openai"),
  );
  const strategies = [
    { value: "paragraph", label: "Paragraph boundaries" },
    { value: "fixed", label: "Fixed length" },
  ];
  const dirty =
    JSON.stringify({
      ...draft,
      chunkSize: Number(size),
      overlap: Number(overlap),
    }) !== JSON.stringify(data.config);
  const disabled = Boolean(busy) || !data.canManage;
  return (
    <Accordion className="mb-6" defaultValue={[]}>
      <AccordionItem value="indexing">
        <AccordionTrigger>Indexing &amp; embeddings</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Shared by knowledge bases and saved memory in this workspace.
              Configure credentials in{" "}
              <Link
                href="/workspace?section=providers"
                className="underline underline-offset-4"
              >
                AI providers
              </Link>
              . Each passage is indexed separately; retrieval combines text
              search with matching embeddings.
            </p>
            {!data.canManage && (
              <p className="text-sm text-muted-foreground">
                Your workspace role can view these settings. Knowledge and
                memory management permissions are required to change them.
              </p>
            )}
            {!data.configured && data.config.enabled && (
              <Alert>
                <AlertTitle>Embedding provider unavailable</AlertTitle>
                <AlertDescription>
                  Configure a provider credential to enable semantic indexing.
                  Text search continues to work.
                </AlertDescription>
              </Alert>
            )}
            <FormRoot
              onSubmit={(event) => {
                event.preventDefault();
                void run("save");
              }}
            >
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={`${id}-enabled`}>
                    Semantic indexing
                  </FieldLabel>
                  <Switch
                    id={`${id}-enabled`}
                    checked={draft.enabled}
                    onCheckedChange={(enabled) =>
                      setDraft({ ...draft, enabled })
                    }
                    disabled={disabled}
                  />
                </Field>
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${id}-provider`}>
                      Embedding provider
                    </FieldLabel>
                    <Select
                      items={providers}
                      value={draft.provider}
                      onValueChange={(provider) => {
                        if (!provider) return;
                        const nextProvider =
                          provider as EmbeddingPreferences["provider"];
                        const keepsCurrentModel = EMBEDDING_MODELS.some(
                          (model) =>
                            model.value === draft.model &&
                            (nextProvider === "auto" ||
                              model.provider ===
                                (nextProvider === "google"
                                  ? "google"
                                  : "openai")),
                        );
                        setDraft({
                          ...draft,
                          provider: nextProvider,
                          ...(keepsCurrentModel
                            ? {}
                            : {
                                model:
                                  nextProvider === "google"
                                    ? "gemini-embedding-2"
                                    : "text-embedding-3-small",
                              }),
                        });
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger id={`${id}-provider`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {providers.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-model`}>
                      Embedding model
                    </FieldLabel>
                    <Select
                      items={compatibleModels}
                      value={draft.model}
                      onValueChange={(model) =>
                        model &&
                        setDraft({
                          ...draft,
                          model: model as EmbeddingPreferences["model"],
                        })
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger id={`${id}-model`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {compatibleModels.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Stored at 1,536 dimensions for all supported models.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-strategy`}>
                      Chunking strategy
                    </FieldLabel>
                    <Select
                      items={strategies}
                      value={draft.strategy}
                      onValueChange={(strategy) =>
                        strategy &&
                        setDraft({
                          ...draft,
                          strategy:
                            strategy as EmbeddingPreferences["strategy"],
                        })
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger id={`${id}-strategy`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {strategies.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Paragraph boundaries keep adjacent sentences together when
                      possible.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={Boolean(errors.chunkSize)}>
                    <FieldLabel htmlFor={`${id}-size`}>
                      Maximum chunk characters
                    </FieldLabel>
                    <Input
                      id={`${id}-size`}
                      type="number"
                      min={256}
                      max={12000}
                      value={size}
                      disabled={disabled}
                      aria-invalid={Boolean(errors.chunkSize)}
                      onChange={(event) => setSize(event.target.value)}
                    />
                    <FieldDescription>
                      256–12,000. Unicode text may use shorter chunks to fit
                      model limits.
                    </FieldDescription>
                    {errors.chunkSize && (
                      <FieldError>{errors.chunkSize}</FieldError>
                    )}
                  </Field>
                  <Field data-invalid={Boolean(errors.overlap)}>
                    <FieldLabel htmlFor={`${id}-overlap`}>
                      Overlap characters
                    </FieldLabel>
                    <Input
                      id={`${id}-overlap`}
                      type="number"
                      min={0}
                      max={2000}
                      value={overlap}
                      disabled={disabled}
                      aria-invalid={Boolean(errors.overlap)}
                      onChange={(event) => setOverlap(event.target.value)}
                    />
                    <FieldDescription>
                      0–2,000; less than half the chunk size.
                    </FieldDescription>
                    {errors.overlap && (
                      <FieldError>{errors.overlap}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
                <p className="text-sm text-muted-foreground">
                  Changing these settings clears existing semantic indexes.
                  Source documents, memories, and text search are preserved.
                  Testing and rebuilding use your provider credentials and may
                  incur provider charges.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={disabled || !dirty}>
                    {busy === "save" && <Spinner data-icon="inline-start" />}
                    Save settings
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(busy) || !draft.enabled}
                    onClick={() => void run("test")}
                  >
                    {busy === "test" && <Spinner data-icon="inline-start" />}
                    Test connection
                  </Button>
                </div>
              </FieldGroup>
            </FormRoot>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {data.documents.pending} of {data.documents.total} knowledge
                documents and {data.memories.pending} of {data.memories.total}{" "}
                personal memories need semantic indexing.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={
                    Boolean(busy) ||
                    dirty ||
                    !data.configured ||
                    !data.canReindexKnowledge
                  }
                  onClick={() => void run("knowledge")}
                >
                  {busy === "knowledge" && <Spinner data-icon="inline-start" />}
                  Rebuild knowledge index
                </Button>
                <Button
                  variant="outline"
                  disabled={Boolean(busy) || dirty || !data.configured}
                  onClick={() => void run("memory")}
                >
                  {busy === "memory" && <Spinner data-icon="inline-start" />}
                  Rebuild accessible memories
                </Button>
                {(busy === "knowledge" || busy === "memory") && (
                  <Button
                    variant="ghost"
                    onClick={() => abortRef.current?.abort()}
                  >
                    Stop rebuild
                  </Button>
                )}
              </div>
              {(busy === "knowledge" || busy === "memory") && (
                <output
                  aria-live="polite"
                  className="text-sm text-muted-foreground"
                >
                  {processed} sources processed
                </output>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Indexing needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && <output className="text-sm">{notice}</output>}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
