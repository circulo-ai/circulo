"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import type { HarnessSnapshot } from "@circulo-ai/types";
import { CheckCircle2, Circle, CircleDot, TriangleAlert } from "lucide-react";

export function HarnessProgress({ snapshot }: { snapshot: HarnessSnapshot }) {
  const completed = snapshot.tasks.filter(
    (task) => task.status === "completed",
  ).length;
  return (
    <section
      className="mt-2 flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3"
      aria-label="Task progress"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">Task progress</h3>
        <Badge
          variant={snapshot.status === "blocked" ? "destructive" : "secondary"}
        >
          {snapshot.status === "completed"
            ? "Complete"
            : snapshot.status === "paused"
              ? "Awaiting approval"
              : snapshot.status === "blocked"
                ? "Needs attention"
                : "In progress"}
        </Badge>
      </div>
      {snapshot.tasks.length > 0 && (
        <>
          <Progress value={completed} max={snapshot.tasks.length}>
            <ProgressLabel>Requirements checked</ProgressLabel>
            <ProgressValue>
              {() => `${completed} of ${snapshot.tasks.length}`}
            </ProgressValue>
          </Progress>
          <Accordion className="max-h-80 min-w-0 overflow-y-auto">
            {snapshot.tasks.map((task) => {
              const Icon =
                task.status === "completed"
                  ? CheckCircle2
                  : task.status === "blocked"
                    ? TriangleAlert
                    : task.status === "running"
                      ? CircleDot
                      : Circle;
              return (
                <AccordionItem key={task.id} value={task.id}>
                  <AccordionTrigger>
                    <span className="flex min-w-0 items-start gap-2">
                      <Icon
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="break-words">
                        {task.title}
                        <span className="sr-only">: {task.status}</span>
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2 text-sm">
                      <p className="text-muted-foreground">
                        Completion check: {task.verification}
                      </p>
                      {task.note && <p className="break-words">{task.note}</p>}
                      {task.evidence.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Backed by {task.evidence.length} successful tool
                          result{task.evidence.length === 1 ? "" : "s"}.
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </>
      )}
      {snapshot.reason && (
        <p
          role={snapshot.status === "blocked" ? "status" : undefined}
          className="text-sm text-muted-foreground"
        >
          {snapshot.reason}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {snapshot.planReason && (
          <span className="mb-2 block">{snapshot.planReason}</span>
        )}
        {snapshot.toolCalls} actions · {snapshot.modelSteps} steps
        {snapshot.completionReviews
          ? ` · ${snapshot.completionReviews} completion review${snapshot.completionReviews === 1 ? "" : "s"}`
          : ""}
        {snapshot.contextCompactions
          ? ` · ${snapshot.contextCompactions} context reductions`
          : ""}
      </p>
    </section>
  );
}
