import type { ArtifactKind } from "@/components/artifacts/artifact";
import {
  FileIcon,
  LoaderIcon,
  MessageIcon,
  PencilEditIcon,
} from "@/components/icons/icons";
import { useArtifact } from "@/hooks/api/chats/use-artifact";
import { memo } from "react";
import { toast } from "sonner";

const getActionText = (
  type: "create" | "update" | "request-suggestions",
  tense: "present" | "past",
) => {
  switch (type) {
    case "create":
      return tense === "present" ? "Creating" : "Created";
    case "update":
      return tense === "present" ? "Updating" : "Updated";
    case "request-suggestions":
      return tense === "present"
        ? "Adding suggestions"
        : "Added suggestions to";
    default:
      return null;
  }
};

type DocumentToolResultProps = {
  type: "create" | "update" | "request-suggestions";
  result: { id: string; title: string; kind: ArtifactKind };
  isReadonly: boolean;
};

function PureDocumentToolResult({
  type,
  result,
  isReadonly,
}: DocumentToolResultProps) {
  const { setArtifact } = useArtifact();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isReadonly) {
      toast.error("Viewing files in shared chats is currently not supported.");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const boundingBox = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };

    setArtifact((currentArtifact) => ({
      documentId: result.id,
      kind: result.kind,
      content: currentArtifact.content,
      title: result.title,
      isVisible: true,
      status: "idle",
      boundingBox,
    }));
  };

  return (
    <button
      className="flex w-fit cursor-pointer flex-row items-start gap-3 rounded-xl border bg-background px-3 py-2 transition-colors hover:bg-muted"
      onClick={handleClick}
      type="button"
      disabled={isReadonly}
    >
      <div className="mt-1 text-muted-foreground">
        {type === "create" ? (
          <FileIcon />
        ) : type === "update" ? (
          <PencilEditIcon />
        ) : type === "request-suggestions" ? (
          <MessageIcon />
        ) : null}
      </div>
      <div className="text-left">
        {`${getActionText(type, "past")} "${result.title}"`}
      </div>
    </button>
  );
}

export const DocumentToolResult = memo(PureDocumentToolResult, () => true);

type DocumentToolCallProps = {
  type: "create" | "update" | "request-suggestions";
  args:
    | { title: string; kind: ArtifactKind } // for create
    | { id: string; description: string } // for update
    | { documentId: string }; // for request-suggestions
  isReadonly: boolean;
};

function PureDocumentToolCall({
  type,
  args,
  isReadonly,
}: DocumentToolCallProps) {
  const { setArtifact } = useArtifact();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isReadonly) {
      toast.error("Viewing files in shared chats is currently not supported.");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const boundingBox = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };

    setArtifact((currentArtifact) => ({
      ...currentArtifact,
      isVisible: true,
      boundingBox,
    }));
  };

  const getDisplayText = () => {
    if (type === "create" && "title" in args && args.title) {
      return `"${args.title}"`;
    }
    if (type === "update" && "description" in args) {
      return `"${args.description}"`;
    }
    if (type === "request-suggestions") {
      return "for document";
    }
    return "";
  };

  return (
    <button
      className="flex w-fit cursor-pointer flex-row items-start justify-between gap-3 rounded-xl border px-3 py-2 transition-colors hover:bg-muted"
      onClick={handleClick}
      type="button"
      disabled={isReadonly}
    >
      <div className="flex flex-row items-start gap-3">
        <div className="mt-1 text-zinc-500">
          {type === "create" ? (
            <FileIcon />
          ) : type === "update" ? (
            <PencilEditIcon />
          ) : type === "request-suggestions" ? (
            <MessageIcon />
          ) : null}
        </div>

        <div className="text-left">
          {`${getActionText(type, "present")} ${getDisplayText()}`}
        </div>
      </div>

      <div className="mt-1 animate-spin">
        <LoaderIcon />
      </div>
    </button>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall, () => true);
