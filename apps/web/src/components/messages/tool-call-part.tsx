"use client";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai-elements/tool";
import type { ArtifactKind } from "@/components/artifacts/artifact";
import {
  DocumentToolCall,
  DocumentToolResult,
} from "@/components/document/document";
import { DocumentPreview } from "@/components/document/document-preview";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import { AlertCircle, FileText, Wrench } from "lucide-react";

export type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  error?: unknown;
};

type ToolOutputEnvelope = {
  type?: unknown;
  value?: unknown;
};

const unwrapToolOutput = (output: unknown): unknown => {
  let value = output;

  for (let index = 0; index < 3; index += 1) {
    if (!value || typeof value !== "object") return value;

    const envelope = value as ToolOutputEnvelope;
    if (
      (envelope.type === "json" ||
        envelope.type === "text" ||
        envelope.type === "error-text") &&
      "value" in envelope
    ) {
      value = envelope.value;
      continue;
    }

    break;
  }

  return value;
};

const toolState = (state: string | undefined): ToolState => {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
    case "output-available":
    case "output-error":
    case "output-denied":
      return state;
    default:
      return "input-available";
  }
};

const displayName = (type: string) => {
  if (type === "dynamic-tool") return "Tool";
  return type
    .replace(/^tool-/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
};

const hasError = (output: unknown) => {
  const value = unwrapToolOutput(output);
  return Boolean(
    value &&
    typeof value === "object" &&
    "error" in value &&
    (value as { error?: unknown }).error,
  );
};

const getErrorText = (part: ToolPart) => {
  if (part.errorText) return part.errorText;
  if (typeof part.error === "string") return part.error;
  if (
    part.output &&
    typeof part.output === "object" &&
    (part.output as ToolOutputEnvelope).type === "error-text"
  ) {
    const value = (part.output as ToolOutputEnvelope).value;
    if (value !== undefined) return String(value).replace(/^Error:\s*/i, "");
  }
  if (hasError(part.output)) {
    const value = unwrapToolOutput(part.output) as { error: unknown };
    return String(value.error).replace(/^Error:\s*/i, "");
  }
  if (part.state === "output-error") return "The tool call failed.";
  if (part.state === "output-denied") return "The tool call was denied.";
  return undefined;
};

const getArtifactResult = (output: unknown) => {
  const unwrapped = unwrapToolOutput(output);
  if (!unwrapped || typeof unwrapped !== "object") return null;
  const value = unwrapped as { id?: unknown; title?: unknown; kind?: unknown };
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !(["text", "image", "code", "sheet"] as const).includes(
      value.kind as "text" | "image" | "code" | "sheet",
    )
  ) {
    return null;
  }
  return value as { id: string; title: string; kind: ArtifactKind };
};

const getArtifactInput = (input: unknown) => {
  if (!input || typeof input !== "object") return null;
  return input as {
    id?: string;
    title?: string;
    kind?: ArtifactKind;
    description?: string;
  };
};

function ArtifactToolOutput({
  isReadonly,
  isPending,
  name,
  part,
}: {
  isReadonly: boolean;
  isPending: boolean;
  name: string;
  part: ToolPart;
}) {
  const result = getArtifactResult(part.output);
  const input = getArtifactInput(part.input);

  if (name === "createDocument" || name === "updateDocument") {
    if (result) {
      return (
        <DocumentPreview
          args={
            name === "updateDocument"
              ? { ...result, isUpdate: true }
              : undefined
          }
          isReadonly={isReadonly}
          result={result}
        />
      );
    }
    if (input) {
      if (!isPending) {
        return (
          <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <FileText className="size-4" />
            Artifact result unavailable
          </div>
        );
      }
      return (
        <DocumentToolCall
          args={
            name === "updateDocument"
              ? {
                  description: input.description ?? "Updating document",
                  id: input.id ?? "",
                }
              : { kind: input.kind ?? "text", title: input.title ?? "Untitled" }
          }
          isReadonly={isReadonly}
          type={name === "updateDocument" ? "update" : "create"}
        />
      );
    }
  }

  if (name === "requestSuggestions" && result) {
    return (
      <DocumentToolResult
        isReadonly={isReadonly}
        result={result}
        type="request-suggestions"
      />
    );
  }

  return null;
}

export function ToolCallPart({
  isReadonly,
  part,
}: {
  isReadonly: boolean;
  part: ToolPart;
}) {
  const name = part.type.replace(/^tool-/, "");
  const state = toolState(part.state);
  const failure = getErrorText(part);
  const resolvedState =
    failure && state !== "approval-requested" && state !== "output-denied"
      ? "output-error"
      : part.output !== undefined && state === "input-available"
        ? "output-available"
        : state;
  const isArtifact = [
    "createDocument",
    "updateDocument",
    "requestSuggestions",
  ].includes(name);
  const isTerminal =
    resolvedState === "output-available" ||
    resolvedState === "output-error" ||
    resolvedState === "output-denied" ||
    part.output !== undefined ||
    Boolean(failure);
  const customOutput = isArtifact ? (
    <ArtifactToolOutput
      isReadonly={isReadonly}
      isPending={!failure && !isTerminal}
      name={name}
      part={part}
    />
  ) : null;
  const output = customOutput ?? (part.output as ToolUIPart["output"]);

  return (
    <Tool
      className={cn("bg-background/60", failure && "border-destructive/40")}
      defaultOpen={
        resolvedState === "output-error" || resolvedState === "output-denied"
      }
    >
      <ToolHeader
        state={resolvedState}
        title={displayName(part.type)}
        type={part.type as ToolUIPart["type"]}
      />
      <ToolContent>
        {part.input !== undefined && (
          <ToolInput input={part.input as ToolUIPart["input"]} />
        )}
        {failure ? (
          <ToolOutput
            errorText={failure}
            output={
              <div className="flex items-start gap-2 text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{failure}</span>
              </div>
            }
          />
        ) : (
          part.output !== undefined && (
            <ToolOutput errorText={undefined} output={output} />
          )
        )}
        {!isTerminal && (
          <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            {isArtifact ? (
              <FileText className="size-3.5" />
            ) : (
              <Wrench className="size-3.5" />
            )}
            {resolvedState === "approval-requested"
              ? "Waiting for approval"
              : "Running"}
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}
