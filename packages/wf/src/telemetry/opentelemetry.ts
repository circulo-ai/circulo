import type { ErrorType, LogContext, Logger, MetricsCollector } from "../models";
import type {
  OpenTelemetryCounter,
  OpenTelemetryHistogram,
  OpenTelemetryLogSink,
  OpenTelemetryMeter,
  OpenTelemetrySpan,
  OpenTelemetryTracer,
  TelemetryAttributes,
  WorkflowSpan,
  WorkflowTracer,
} from "../models";

/** MetricsCollector implementation backed by an injected OpenTelemetry Meter. */
export class OpenTelemetryMetricsAdapter implements MetricsCollector {
  private readonly counters = new Map<string, OpenTelemetryCounter>();
  private readonly histograms = new Map<string, OpenTelemetryHistogram>();

  constructor(private readonly meter: OpenTelemetryMeter) {}

  recordStepDuration(stepName: string, duration: number): void {
    this.histogram("workflow.step.duration").record(duration, { step: stepName });
  }

  recordStepSuccess(stepName: string): void {
    this.counter("workflow.step.success").add(1, { step: stepName });
  }

  recordStepFailure(stepName: string, errorType: ErrorType): void {
    this.counter("workflow.step.failure").add(1, { step: stepName, error_type: errorType });
  }

  recordStepRetry(stepName: string, attempt: number): void {
    this.counter("workflow.step.retry").add(1, { step: stepName, attempt });
  }

  recordWorkflowDuration(duration: number): void {
    this.histogram("workflow.duration").record(duration);
  }

  recordWorkflowSuccess(): void {
    this.counter("workflow.success").add(1);
  }

  recordWorkflowFailure(errorType: ErrorType): void {
    this.counter("workflow.failure").add(1, { error_type: errorType });
  }

  incrementCounter(metric: string, tags: Record<string, string> = {}): void {
    this.counter(metric).add(1, tags);
  }

  recordGauge(metric: string, value: number, tags: Record<string, string> = {}): void {
    this.histogram(`${metric}.gauge`).record(value, tags);
  }

  private counter(name: string): OpenTelemetryCounter {
    const current = this.counters.get(name);
    if (current) return current;
    const created = this.meter.createCounter(name);
    this.counters.set(name, created);
    return created;
  }

  private histogram(name: string): OpenTelemetryHistogram {
    const current = this.histograms.get(name);
    if (current) return current;
    const created = this.meter.createHistogram(name);
    this.histograms.set(name, created);
    return created;
  }
}

/** Logger implementation backed by an OpenTelemetry-compatible log sink. */
export class OpenTelemetryLoggerAdapter implements Logger {
  constructor(
    private readonly sink: OpenTelemetryLogSink,
    private readonly context: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.emit("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.emit("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.emit("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.emit("error", message, { ...context, error: error?.message, stack: error?.stack });
  }

  child(context: LogContext): Logger {
    return new OpenTelemetryLoggerAdapter(this.sink, { ...this.context, ...context });
  }

  private emit(level: "debug" | "info" | "warn" | "error", message: string, context?: LogContext): void {
    this.sink.emit(level, message, { ...this.context, ...context });
  }
}

/** Small span facade that keeps wf independent from a specific OpenTelemetry package version. */
export class OpenTelemetryTracerAdapter implements WorkflowTracer {
  constructor(private readonly tracer: OpenTelemetryTracer) {}

  startSpan(name: string, attributes: TelemetryAttributes = {}): WorkflowSpan {
    return new OpenTelemetrySpanAdapter(this.tracer.startSpan(name, { attributes }));
  }
}

class OpenTelemetrySpanAdapter implements WorkflowSpan {
  constructor(private readonly span: OpenTelemetrySpan) {}

  setAttribute(name: string, value: string | number | boolean): void {
    this.span.setAttribute(name, value);
  }

  recordException(error: Error): void {
    this.span.recordException(error);
  }

  setStatus(status: "ok" | "error", message?: string): void {
    if (status === "ok") {
      this.span.setStatus({ code: "OK" });
      return;
    }
    this.span.setStatus(message === undefined ? { code: "ERROR" } : { code: "ERROR", message });
  }

  end(): void {
    this.span.end();
  }
}
