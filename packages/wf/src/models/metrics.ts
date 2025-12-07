import type { ErrorType } from "./workflow";

export interface MetricsCollector {
  recordStepDuration(stepName: string, duration: number): void;
  recordStepSuccess(stepName: string): void;
  recordStepFailure(stepName: string, errorType: ErrorType): void;
  recordStepRetry(stepName: string, attempt: number): void;
  recordWorkflowDuration(duration: number): void;
  recordWorkflowSuccess(): void;
  recordWorkflowFailure(errorType: ErrorType): void;
  incrementCounter(metric: string, tags?: Record<string, string>): void;
  recordGauge(metric: string, value: number, tags?: Record<string, string>): void;
}