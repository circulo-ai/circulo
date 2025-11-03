"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
  Loader2Icon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement, useState } from "react";
import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, defaultOpen = true, ...props }: ToolProps) => (
  <Collapsible
    defaultOpen={defaultOpen}
    className={cn(
      "not-prose mb-4 w-full rounded-lg border bg-card shadow-sm transition-all hover:shadow-md",
      className
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  type: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  className?: string;
};

const getStatusBadge = (
  status: "input-streaming" | "input-available" | "output-available" | "output-error"
) => {
  const config = {
    "input-streaming": {
      label: "Streaming",
      icon: <Loader2Icon className="h-3.5 w-3.5 animate-spin" />,
      variant: "secondary" as const,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    "input-available": {
      label: "Running",
      icon: <ClockIcon className="h-3.5 w-3.5 animate-pulse" />,
      variant: "secondary" as const,
      className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    },
    "output-available": {
      label: "Completed",
      icon: <CheckCircleIcon className="h-3.5 w-3.5" />,
      variant: "secondary" as const,
      className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    "output-error": {
      label: "Error",
      icon: <XCircleIcon className="h-3.5 w-3.5" />,
      variant: "destructive" as const,
      className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
  };

  const { label, icon, variant, className } = config[status];

  return (
    <Badge className={cn("gap-1.5 rounded-full text-xs font-medium", className)} variant={variant}>
      {icon}
      {label}
    </Badge>
  );
};

const formatToolName = (type: string): string => {
  // Remove common prefixes
  const cleaned = type
    .replace(/^(tool-|dynamic-)/i, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ");
  
  // Capitalize each word
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const ToolHeader = ({
  className,
  title,
  type,
  state = "input-available",
  ...props
}: ToolHeaderProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const displayTitle = title || formatToolName(type);

  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full items-center justify-between gap-4 p-4 transition-colors hover:bg-accent/50",
        className
      )}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
          <WrenchIcon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium truncate">{displayTitle}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon
        className={cn(
          "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const inputString = typeof input === "string" 
    ? input 
    : JSON.stringify(input, null, 2);

  return (
    <div className={cn("space-y-2 border-t p-4", className)} {...props}>
      <div className="flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-primary"></div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Input Parameters
        </h4>
      </div>
      <div className="rounded-md bg-muted/30 overflow-hidden">
        <CodeBlock code={inputString} language="json" />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: unknown;
  errorText?: string;
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let OutputContent: ReactNode;

  if (errorText) {
    OutputContent = (
      <div className="p-3 text-sm text-destructive">
        {errorText}
      </div>
    );
  } else if (typeof output === "object" && !isValidElement(output)) {
    OutputContent = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    // Try to parse as JSON for better formatting
    try {
      const parsed = JSON.parse(output);
      OutputContent = (
        <CodeBlock code={JSON.stringify(parsed, null, 2)} language="json" />
      );
    } catch {
      // Not JSON, render as plain text with code formatting
      OutputContent = <CodeBlock code={output} language="text" />;
    }
  } else {
    OutputContent = <div className="p-3 text-sm">{output as ReactNode}</div>;
  }

  return (
    <div className={cn("space-y-2 border-t p-4", className)} {...props}>
      <div className="flex items-center gap-2">
        <div className={cn(
          "h-1 w-1 rounded-full",
          errorText ? "bg-destructive" : "bg-green-500"
        )}></div>
        <h4 className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          errorText ? "text-destructive" : "text-muted-foreground"
        )}>
          {errorText ? "Error Output" : "Result"}
        </h4>
      </div>
      <div
        className={cn(
          "overflow-x-auto rounded-md",
          errorText
            ? "bg-destructive/5 border border-destructive/20"
            : "bg-muted/30"
        )}
      >
        {OutputContent}
      </div>
    </div>
  );
};