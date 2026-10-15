export type HarnessTask = {
  id: string;
  title: string;
  verification: string;
  evidenceKind: "tool" | "response";
  expectedTools: string[];
  dependsOn: string[];
  status: "pending" | "running" | "completed" | "blocked";
  evidence: string[];
  note: string;
};

export type HarnessSnapshot = {
  executionId: string;
  agentId: string;
  goal: string;
  tasks: HarnessTask[];
  status: "running" | "paused" | "completed" | "blocked";
  reason?: string;
  modelSteps: number;
  toolCalls: number;
  tokens: number;
  contextCompactions: number;
  completionReviews?: number;
  reviewSignature?: string;
  planReason?: string;
  updatedAt: string;
};
