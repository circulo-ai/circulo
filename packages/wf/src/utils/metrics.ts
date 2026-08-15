import type { ErrorType, MetricsCollector } from "../models";

export interface MetricValue {
  value: number;
  timestamp: number;
  tags: Record<string, string>;
}

export class InMemoryMetrics implements MetricsCollector {
  private counters = new Map<string, MetricValue[]>();
  private gauges = new Map<string, MetricValue[]>();
  private histograms = new Map<string, MetricValue[]>();

  recordStepDuration(stepName: string, duration: number): void {
    this.recordHistogram("step.duration", duration, { step: stepName });
  }

  recordStepSuccess(stepName: string): void {
    this.incrementCounter("step.success", { step: stepName });
  }

  recordStepFailure(stepName: string, errorType: ErrorType): void {
    this.incrementCounter("step.failure", {
      step: stepName,
      error_type: errorType,
    });
  }

  recordStepRetry(stepName: string, attempt: number): void {
    this.incrementCounter("step.retry", {
      step: stepName,
      attempt: String(attempt),
    });
  }

  recordWorkflowDuration(duration: number): void {
    this.recordHistogram("workflow.duration", duration, {});
  }

  recordWorkflowSuccess(): void {
    this.incrementCounter("workflow.success", {});
  }

  recordWorkflowFailure(errorType: ErrorType): void {
    this.incrementCounter("workflow.failure", { error_type: errorType });
  }

  incrementCounter(metric: string, tags: Record<string, string> = {}): void {
    if (!this.counters.has(metric)) {
      this.counters.set(metric, []);
    }
    this.counters.get(metric)!.push({
      value: 1,
      timestamp: Date.now(),
      tags,
    });
  }

  recordGauge(
    metric: string,
    value: number,
    tags: Record<string, string> = {},
  ): void {
    if (!this.gauges.has(metric)) {
      this.gauges.set(metric, []);
    }
    this.gauges.get(metric)!.push({
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  private recordHistogram(
    metric: string,
    value: number,
    tags: Record<string, string>,
  ): void {
    if (!this.histograms.has(metric)) {
      this.histograms.set(metric, []);
    }
    this.histograms.get(metric)!.push({
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  getMetrics(): {
    counters: Map<string, MetricValue[]>;
    gauges: Map<string, MetricValue[]>;
    histograms: Map<string, MetricValue[]>;
  } {
    const clone = (
      metrics: Map<string, MetricValue[]>,
    ): Map<string, MetricValue[]> =>
      new Map(
        Array.from(metrics, ([name, values]) => [
          name,
          values.map((metric) => ({ ...metric, tags: { ...metric.tags } })),
        ]),
      );

    return {
      counters: clone(this.counters),
      gauges: clone(this.gauges),
      histograms: clone(this.histograms),
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
