"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_AGENT_EXECUTION_SETTINGS,
  type AgentExecutionSettings as Settings,
} from "@circulo-ai/types";
import { AlertCircleIcon, CheckIcon, LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import useSWR from "swr";

const identityNumber = (value: number) => value;
const minutesToMilliseconds = (minutes: number) => minutes * 60_000;
const millisecondsToMinutes = (milliseconds: number) =>
  Math.ceil(milliseconds / 60_000);

type SettingsResponse = {
  config: Settings;
  canManage: boolean;
  usageBudgetsAvailable: boolean;
};

const SETTINGS_ENDPOINT = "/api/workspace/agent-execution-settings";

async function loadSettings(url: string): Promise<SettingsResponse> {
  const response = await fetch(url);
  if (!response.ok)
    throw await responseError(response, "Unable to load settings");
  return response.json() as Promise<SettingsResponse>;
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  return new Error(body?.message ?? body?.error ?? fallback);
}

export function AgentExecutionSettings() {
  const { data, error, isLoading, mutate } = useSWR(
    SETTINGS_ENDPOINT,
    loadSettings,
  );
  const [settings, setSettings] = useState<Settings>(
    DEFAULT_AGENT_EXECUTION_SETTINGS,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setSettings(data.config);
  }, [data]);

  const canManage = data?.canManage ?? false;
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setIsSaving(true);
    setSaveError(undefined);
    setSaved(false);
    try {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        throw await responseError(response, "Unable to save settings");
      }
      const result = (await response.json()) as SettingsResponse;
      setSettings(result.config);
      await mutate(result, false);
      setSaved(true);
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Unable to save settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Loading execution settings…
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Settings could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>
            {error instanceof Error
              ? error.message
              : "Try refreshing this page."}
          </span>
          <Button type="button" variant="outline" onClick={() => void mutate()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!canManage && (
        <Alert>
          <AlertDescription>
            You can review these values. Workspace management permission is
            required to change them.
          </AlertDescription>
        </Alert>
      )}

      <LimitCard
        title="Agent loop limits"
        description="Controls how long an individual agent can reason and use tools before Circulo checkpoints its work."
      >
        <CappedNumberField
          label="Model steps"
          description="Maximum model turns for each agent task."
          value={settings.agentLoop.modelSteps}
          defaultValue={40}
          min={1}
          max={10_000}
          disabled={!canManage}
          onChange={(value) =>
            update("agentLoop", { ...settings.agentLoop, modelSteps: value })
          }
        />
        <CappedNumberField
          label="Tool calls"
          description="Maximum tool calls for each agent task."
          value={settings.agentLoop.toolCalls}
          defaultValue={120}
          min={1}
          max={100_000}
          disabled={!canManage}
          onChange={(value) =>
            update("agentLoop", { ...settings.agentLoop, toolCalls: value })
          }
        />
        <CappedNumberField
          label="Tokens per agent"
          description="Input and output tokens across one agent task."
          value={settings.agentLoop.tokens}
          defaultValue={250_000}
          min={1}
          max={100_000_000}
          step={1_000}
          disabled={!canManage}
          onChange={(value) =>
            update("agentLoop", { ...settings.agentLoop, tokens: value })
          }
        />
        <CappedNumberField
          label="Agent runtime"
          description="Maximum active time for one agent task."
          value={settings.agentLoop.runtimeMs}
          defaultValue={10}
          min={1}
          max={10_080}
          unit="minutes"
          toStoredValue={minutesToMilliseconds}
          fromStoredValue={millisecondsToMinutes}
          disabled={!canManage}
          onChange={(value) =>
            update("agentLoop", {
              ...settings.agentLoop,
              runtimeMs: value === null ? null : value * 60_000,
            })
          }
        />
      </LimitCard>

      <LimitCard
        title="Whole workflow limits"
        description="Controls the total orchestration run across all agents and continuation rounds."
      >
        <CappedNumberField
          label="Continuation rounds"
          description="Maximum times the workflow can continue after an agent pass."
          value={settings.workflow.continuationRounds}
          defaultValue={4}
          min={1}
          max={1_000}
          disabled={!canManage}
          onChange={(value) =>
            update("workflow", {
              ...settings.workflow,
              continuationRounds: value,
            })
          }
        />
        <CappedNumberField
          label="Total agent tasks"
          description="Maximum number of agent tasks started by one workflow."
          value={settings.workflow.totalAgentTasks}
          defaultValue={12}
          min={1}
          max={10_000}
          disabled={!canManage}
          onChange={(value) =>
            update("workflow", {
              ...settings.workflow,
              totalAgentTasks: value,
            })
          }
        />
        <CappedNumberField
          label="Workflow runtime"
          description="Maximum active time for one complete workflow."
          value={settings.workflow.runtimeMs}
          defaultValue={25}
          min={1}
          max={10_080}
          unit="minutes"
          toStoredValue={minutesToMilliseconds}
          fromStoredValue={millisecondsToMinutes}
          disabled={!canManage}
          onChange={(value) =>
            update("workflow", {
              ...settings.workflow,
              runtimeMs: value === null ? null : value * 60_000,
            })
          }
        />
      </LimitCard>

      <LimitCard
        title="Conversation context"
        description="Sets the history target sent to models. Provider and model context windows remain enforced."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-medium">History target</p>
            <p className="text-sm text-muted-foreground">
              Auto uses the runtime-selected history. A custom value is clamped
              to the selected model’s supported input context.
            </p>
          </div>
          <Select
            value={
              settings.conversationContextTokens === null ? "auto" : "custom"
            }
            onValueChange={(value) => {
              if (value === "auto") update("conversationContextTokens", null);
              if (
                value === "custom" &&
                settings.conversationContextTokens === null
              )
                update("conversationContextTokens", 30_000);
            }}
            items={[
              { value: "auto", label: "Auto" },
              { value: "custom", label: "Custom target" },
            ]}
            disabled={!canManage}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="custom">Custom target</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {settings.conversationContextTokens !== null && (
          <div className="mt-4 max-w-sm">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Context target (tokens)
              <Input
                type="number"
                aria-label="Context target in tokens"
                min={256}
                max={1_000_000}
                step={256}
                value={settings.conversationContextTokens}
                disabled={!canManage}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(value) &&
                    value >= 256 &&
                    value <= 1_000_000
                  )
                    update("conversationContextTokens", value);
                }}
              />
            </label>
          </div>
        )}
      </LimitCard>

      {data.usageBudgetsAvailable && (
        <LimitCard
          title="Local usage budgets"
          description="Optional workspace-wide rolling limits for interactive model tokens across members and providers."
        >
          <CappedNumberField
            label="Rolling five-hour tokens"
            description="Input plus output tokens during the trailing five hours."
            value={settings.usageBudgets.rollingFiveHourTokens}
            defaultValue={1_000_000}
            min={1}
            max={1_000_000_000}
            step={10_000}
            disabled={!canManage}
            onChange={(value) =>
              update("usageBudgets", {
                ...settings.usageBudgets,
                rollingFiveHourTokens: value,
              })
            }
          />
          <CappedNumberField
            label="Rolling seven-day tokens"
            description="Input plus output tokens during the trailing seven days."
            value={settings.usageBudgets.rollingSevenDayTokens}
            defaultValue={10_000_000}
            min={1}
            max={10_000_000_000}
            step={100_000}
            disabled={!canManage}
            onChange={(value) =>
              update("usageBudgets", {
                ...settings.usageBudgets,
                rollingSevenDayTokens: value,
              })
            }
          />
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Circulo reserves estimated input and maximum output tokens before
            each model call, then reconciles reported usage. Conservative
            reservations can pause work before the exact limit.
          </p>
        </LimitCard>
      )}

      {saveError && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not save settings</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && (
          <span
            aria-live="polite"
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            <CheckIcon className="size-4" /> Saved. Changes apply to new runs.
          </span>
        )}
        <Button type="button" disabled={!canManage || isSaving} onClick={save}>
          {isSaving && <LoaderCircleIcon className="size-4 animate-spin" />}
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function LimitCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {children}
      </CardContent>
    </Card>
  );
}

function CappedNumberField({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  unit,
  toStoredValue = identityNumber,
  fromStoredValue = identityNumber,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: number | null;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  toStoredValue?: (value: number) => number;
  fromStoredValue?: (value: number) => number;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(
    value === null ? "" : String(fromStoredValue(value)),
  );
  const enabled = value !== null;

  useEffect(() => {
    setDraft(value === null ? "" : String(fromStoredValue(value)));
  }, [fromStoredValue, value]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          aria-label={`${label}: set a workspace cap`}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (checked) {
              onChange(toStoredValue(defaultValue));
            } else {
              onChange(null);
            }
          }}
        />
      </div>
      {enabled && (
        <label className="flex max-w-sm items-center gap-2 text-sm text-muted-foreground">
          <Input
            type="number"
            aria-label={`${label}${unit ? ` (${unit})` : ""}`}
            min={min}
            max={max}
            step={step}
            value={draft}
            disabled={disabled}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setDraft(next);
              if (!next) return;
              const parsed = Number(next);
              if (!Number.isInteger(parsed) || parsed < min || parsed > max)
                return;
              onChange(toStoredValue(parsed));
            }}
            onBlur={() => {
              const parsed = Number(draft);
              if (
                !draft ||
                !Number.isInteger(parsed) ||
                parsed < min ||
                parsed > max
              ) {
                setDraft(
                  String(fromStoredValue(value ?? toStoredValue(defaultValue))),
                );
              }
            }}
          />
          {unit}
        </label>
      )}
      {!enabled && (
        <p className="text-xs text-muted-foreground">No workspace cap</p>
      )}
    </div>
  );
}
