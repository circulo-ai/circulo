import type { LanguageModelUsage } from "ai";
// Imported from the subpath that actually declares `UsageData`.
// `tokenlens/helpers` only re-exports it from here, which resolves in the
// apps by hoisting but not in a leaf package that depends on `tokenlens`
// alone.
import type { UsageData } from "@tokenlens/helpers/context";

// Server-merged usage: base usage + TokenLens summary + optional modelId
export type AppUsage = LanguageModelUsage &
  UsageData & {
    modelId?: string;
    cost?: number;
  };
