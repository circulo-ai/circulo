"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiProviderDefinition, AiProviderId } from "@circulo-ai/types";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type ProviderCredential = {
  id: string;
  providerId: AiProviderId;
  name: string;
  baseUrl: string | null;
  enabled: boolean;
  lastValidatedAt: string | null;
};

type ProvidersResponse = {
  providers: AiProviderDefinition[];
  credentials: ProviderCredential[];
};

const emptyForm = {
  providerId: "openrouter" as AiProviderId,
  name: "My API key",
  apiKey: "",
  baseUrl: "",
};

export function AIProviders({
  variant = "modal",
}: {
  variant?: "modal" | "workspace";
}) {
  const isWorkspace = variant === "workspace";
  const { data, error, mutate } =
    useSWR<ProvidersResponse>("/api/ai-providers");
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectedDefinition = useMemo(
    () => data?.providers.find((provider) => provider.id === form.providerId),
    [data?.providers, form.providerId],
  );

  async function addCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          providerId: form.providerId,
          name: form.name,
          apiKey: form.apiKey,
          ...(form.baseUrl.trim() ? { baseUrl: form.baseUrl.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to save API key");
      setForm(emptyForm);
      await mutate();
      toast.success("Provider connected");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save API key",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCredential(id: string) {
    if (
      !window.confirm(
        "Remove this provider key? Existing agents will stop using it.",
      )
    )
      return;
    setDeletingId(id);
    try {
      const response = await fetch(`/api/ai-providers/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "Unable to remove provider key");
      }
      await mutate();
      toast.success("Provider key removed");
    } catch (removeError) {
      toast.error(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove provider key",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className={
        isWorkspace ? "flex flex-col gap-6" : "space-y-6 px-6 pt-4 pb-6"
      }
    >
      {!isWorkspace && (
        <div>
          <h2 className="text-base font-medium">AI providers</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect your own API keys. Requests made with a connected provider
            go directly to that provider and are not charged to your Circulo
            account.
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Provider settings unavailable</AlertTitle>
          <AlertDescription>Refresh the page and try again.</AlertDescription>
        </Alert>
      )}

      {data?.credentials.length ? (
        <div
          className={
            isWorkspace
              ? "divide-y rounded-xl border bg-card"
              : "divide-y rounded-xl border"
          }
        >
          {data.credentials.map((credential) => (
            <div key={credential.id} className="flex items-center gap-3 p-3">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {credential.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.providers.find(
                    (provider) => provider.id === credential.providerId,
                  )?.name ?? credential.providerId}
                  {credential.baseUrl ? ` · ${credential.baseUrl}` : ""}
                </p>
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Connected
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${credential.name}`}
                disabled={deletingId === credential.id}
                onClick={() => void removeCredential(credential.id)}
              >
                {deletingId === credential.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected providers</CardTitle>
            <CardDescription>
              No provider keys connected yet. Add one below to use your own
              provider account.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <form
        onSubmit={(event) => void addCredential(event)}
        className={
          isWorkspace
            ? "space-y-4 rounded-xl border bg-card p-5"
            : "space-y-4 rounded-xl border bg-muted/20 p-4"
        }
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="size-4" /> Add provider key
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-provider">Provider</Label>
            <select
              id="ai-provider"
              value={form.providerId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  providerId: event.target.value as AiProviderId,
                  baseUrl: "",
                }))
              }
              className="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {(data?.providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-provider-name">Label</Label>
            <Input
              id="ai-provider-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              maxLength={80}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-provider-key">API key</Label>
          <Input
            id="ai-provider-key"
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(event) =>
              setForm((current) => ({ ...current, apiKey: event.target.value }))
            }
            placeholder={
              form.providerId === "ollama"
                ? "Optional for local Ollama"
                : "Paste your provider key"
            }
            required={form.providerId !== "ollama"}
          />
          <p className="text-xs text-muted-foreground">
            The key is encrypted before it is stored and is never shown again.
          </p>
        </div>
        {(form.providerId === "openai-compatible" ||
          form.providerId === "ollama") && (
          <div className="space-y-2">
            <Label htmlFor="ai-provider-base-url">API base URL</Label>
            <Input
              id="ai-provider-base-url"
              type="url"
              value={form.baseUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
              placeholder={
                form.providerId === "ollama"
                  ? "http://localhost:11434/v1"
                  : "https://your-provider.example/v1"
              }
              required={form.providerId === "openai-compatible"}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedDefinition?.description}
          </p>
          <Button type="submit" disabled={isSaving || !data?.providers.length}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Connect
          </Button>
        </div>
      </form>
    </div>
  );
}
