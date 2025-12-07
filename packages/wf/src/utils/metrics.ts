import type { MetricsCollector, ErrorType } from "../models";

interface MetricValue {
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
    return {
      counters: this.counters,
      gauges: this.gauges,
      histograms: this.histograms,
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
