"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Pause, Play, RotateCcw, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type Conversation = { id: string; title?: string | null; name?: string | null };
type WebhookRecord = {
  id: string;
  chatId: string;
  name: string;
  source: string;
  eventName: string;
  status: "active" | "paused" | "disabled";
  endpoint: string;
  lastTriggeredAt: string | null;
  lastDeliveryStatus: "accepted" | "duplicate" | "failed" | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load webhooks");
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

export function AutomationWebhooks({
  organizationId,
  conversations,
}: {
  organizationId?: string;
  conversations: Conversation[];
}) {
  const { data, error, mutate } = useSWR<WebhookRecord[]>(
    organizationId ? "/api/automation/webhooks" : null,
    fetcher,
  );
  const [name, setName] = useState("");
  const [eventName, setEventName] = useState("event.received");
  const [source, setSource] = useState("custom");
  const [chatId, setChatId] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const createWebhook = async () => {
    if (!organizationId || !name.trim() || !chatId) {
      toast.error("Add a name and choose the destination chat.");
      return;
    }
    setSaving(true);
    try {
      const result = await request("/api/automation/webhooks", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          chatId,
          name: name.trim(),
          source,
          eventName: eventName.trim(),
        }),
      });
      setSecret(result.secret);
      setName("");
      setEventName("event.received");
      await mutate();
      toast.success(
        "Webhook created. Save the secret now; it will not be shown again.",
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create webhook",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (webhook: WebhookRecord) => {
    try {
      await request(`/api/automation/webhooks/${webhook.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: webhook.status === "paused" ? "active" : "paused",
        }),
      });
      await mutate();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update webhook",
      );
    }
  };

  const rotateSecret = async (webhook: WebhookRecord) => {
    try {
      const result = await request(
        `/api/automation/webhooks/${webhook.id}/rotate-secret`,
        {
          method: "POST",
        },
      );
      setSecret(result.secret);
      toast.success(
        "Webhook secret rotated. Update the provider before sending again.",
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Unable to rotate secret",
      );
    }
  };

  const deleteWebhook = async (webhook: WebhookRecord) => {
    if (
      !window.confirm(
        `Delete “${webhook.name}”? Existing delivery history will also be removed.`,
      )
    )
      return;
    try {
      await request(`/api/automation/webhooks/${webhook.id}`, {
        method: "DELETE",
      });
      await mutate();
      toast.success("Webhook deleted");
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete webhook",
      );
    }
  };

  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Webhook className="text-primary" data-icon="inline-start" />
            <h2 className="text-lg font-medium">Inbound webhooks</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Start an orchestrated run in a selected chat from GitHub, Slack,
            Telegram, or a custom signed event. Secrets are encrypted at rest
            and shown only when created or rotated.
          </p>
        </div>
      </div>

      {secret && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="font-medium">Save this signing secret now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It will not be displayed again. Sign the string timestamp + dot +
            raw body with HMAC-SHA256 and send the hex digest in
            `x-wf-signature`.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              aria-label="Webhook signing secret"
              readOnly
              value={secret}
            />
            <Button
              aria-label="Copy webhook secret"
              onClick={() => void navigator.clipboard.writeText(secret)}
              size="icon"
              variant="outline"
            >
              <Copy data-icon="inline-start" />
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Only workspace managers can view or manage inbound webhooks.
        </p>
      ) : (
        <>
          <div className="grid gap-3 rounded-xl border p-4 md:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1fr_auto]">
            <Input
              aria-label="Webhook name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Webhook name"
              value={name}
            />
            <Input
              aria-label="Webhook event name"
              onChange={(event) => setEventName(event.target.value)}
              placeholder="event.received"
              value={eventName}
            />
            <Select
              onValueChange={(value) => setSource(value ?? "custom")}
              value={source}
            >
              <SelectTrigger aria-label="Webhook source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select
                onValueChange={(value) => setChatId(value ?? "")}
                value={chatId}
              >
                <SelectTrigger
                  aria-label="Webhook destination chat"
                  className="min-w-0 flex-1"
                >
                  <SelectValue placeholder="Destination chat" />
                </SelectTrigger>
                <SelectContent>
                  {conversations.map((conversation) => (
                    <SelectItem key={conversation.id} value={conversation.id}>
                      {conversation.title ??
                        conversation.name ??
                        conversation.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={saving} onClick={() => void createWebhook()}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>

          {data && data.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.map((webhook) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border p-4"
                  key={webhook.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{webhook.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {webhook.source} · {webhook.eventName} ·{" "}
                        {webhook.status}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {webhook.lastDeliveryStatus ?? "never used"}
                    </span>
                  </div>
                  <code className="block truncate rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    {webhook.endpoint}
                  </code>
                  <p className="text-xs text-muted-foreground">
                    {webhook.lastTriggeredAt
                      ? `Last received ${new Date(webhook.lastTriggeredAt).toLocaleString()}`
                      : "No deliveries received yet."}
                  </p>
                  <div className="flex gap-1">
                    {webhook.status !== "disabled" && (
                      <Button
                        aria-label={`${webhook.status === "paused" ? "Resume" : "Pause"} ${webhook.name}`}
                        onClick={() => void updateStatus(webhook)}
                        size="icon"
                        variant="ghost"
                      >
                        {webhook.status === "paused" ? (
                          <Play data-icon="inline-start" />
                        ) : (
                          <Pause data-icon="inline-start" />
                        )}
                      </Button>
                    )}
                    <Button
                      aria-label={`Rotate secret for ${webhook.name}`}
                      onClick={() => void rotateSecret(webhook)}
                      size="icon"
                      variant="ghost"
                    >
                      <RotateCcw data-icon="inline-start" />
                    </Button>
                    <Button
                      aria-label={`Delete ${webhook.name}`}
                      onClick={() => void deleteWebhook(webhook)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 data-icon="inline-start" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No inbound webhooks yet.
            </p>
          )}
        </>
      )}
    </section>
  );
}
