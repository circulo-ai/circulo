import type { LogContext, Logger } from "./logger";
import type { MetricsCollector } from "./metrics";

export type TelemetryAttribute = string | number | boolean;
export type TelemetryAttributes = Record<string, TelemetryAttribute>;

export interface WorkflowSpan {
  setAttribute(name: string, value: TelemetryAttribute): void;
  recordException(error: Error): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}

export interface WorkflowTracer {
  startSpan(name: string, attributes?: TelemetryAttributes): WorkflowSpan;
}

export interface WorkflowTelemetry {
  tracer?: WorkflowTracer;
  metrics?: MetricsCollector;
  logger?: Logger;
}

export interface OpenTelemetryCounter {
  add(value: number, attributes?: TelemetryAttributes): void;
}

export interface OpenTelemetryHistogram {
  record(value: number, attributes?: TelemetryAttributes): void;
}

export interface OpenTelemetryMeter {
  createCounter(name: string, options?: { description?: string }): OpenTelemetryCounter;
  createHistogram(name: string, options?: { description?: string }): OpenTelemetryHistogram;
}

export interface OpenTelemetryTracer {
  startSpan(name: string, options?: { attributes?: TelemetryAttributes }): OpenTelemetrySpan;
}

export interface OpenTelemetrySpan {
  setAttribute(name: string, value: TelemetryAttribute): OpenTelemetrySpan | void;
  recordException(error: Error): OpenTelemetrySpan | void;
  setStatus(status: { code: "OK" | "ERROR"; message?: string }): OpenTelemetrySpan | void;
  end(): void;
}

export interface OpenTelemetryLogSink {
  emit(level: "debug" | "info" | "warn" | "error", message: string, context: LogContext): void;
}
