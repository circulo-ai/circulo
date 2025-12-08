import type { LogContext, Logger, LogLevel } from "../models";

export class ConsoleLogger implements Logger {
  constructor(
    private level: LogLevel = "info",
    private context: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format("DEBUG", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      console.info(this.format("INFO", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(this.format("WARN", message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog("error")) {
      const ctx = { ...context, error: error?.message, stack: error?.stack };
      console.error(this.format("ERROR", message, ctx));
    }
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger(this.level, { ...this.context, ...context });
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentIndex = levels.indexOf(this.level);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  private format(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = { ...this.context, ...context };
    const contextStr = Object.keys(ctx).length > 0 ? JSON.stringify(ctx) : "";
    return `[${timestamp}] ${level} ${message} ${contextStr}`;
  }
}
