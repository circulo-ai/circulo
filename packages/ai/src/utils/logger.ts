/**
 * Logging utility for the SDK
 * 
 * Provides structured logging with different log levels and optional transports.
 * Can be configured to use console, file, or external logging services.
 */

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
    error?: Error;
}

export interface LoggerConfig {
    level?: LogLevel;
    enableConsole?: boolean;
    enableFile?: boolean;
    filePath?: string;
    customTransport?: (entry: LogEntry) => void;
}

/**
 * Logger class for structured logging
 */
export class Logger {
    private config: LoggerConfig;
    private static instance: Logger | null = null;

    constructor(config: LoggerConfig = {}) {
        this.config = {
            level: config.level || LogLevel.INFO,
            enableConsole: config.enableConsole !== false,
            enableFile: config.enableFile || false,
            filePath: config.filePath,
            customTransport: config.customTransport,
        };
    }

    /**
     * Get singleton logger instance
     */
    static getInstance(config?: LoggerConfig): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger(config);
        }
        return Logger.instance;
    }

    /**
     * Configure the logger
     */
    configure(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Check if a log level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const configLevelIndex = levels.indexOf(this.config.level!);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= configLevelIndex;
    }

    /**
     * Format log entry
     */
    private formatEntry(entry: LogEntry): string {
        const { level, message, timestamp, context, error } = entry;
        let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        if (context && Object.keys(context).length > 0) {
            formatted += ` ${JSON.stringify(context)}`;
        }

        if (error) {
            formatted += `\n${error.stack || error.message}`;
        }

        return formatted;
    }

    /**
     * Write log entry to transports
     */
    private write(entry: LogEntry): void {
        if (!this.shouldLog(entry.level)) {
            return;
        }

        const formatted = this.formatEntry(entry);

        // Console transport
        if (this.config.enableConsole) {
            switch (entry.level) {
                case LogLevel.DEBUG:
                case LogLevel.INFO:
                    console.log(formatted);
                    break;
                case LogLevel.WARN:
                    console.warn(formatted);
                    break;
                case LogLevel.ERROR:
                    console.error(formatted);
                    break;
            }
        }

        // File transport (placeholder - would need fs module)
        if (this.config.enableFile && this.config.filePath) {
            // In a real implementation:
            // fs.appendFileSync(this.config.filePath, formatted + '\n');
        }

        // Custom transport
        if (this.config.customTransport) {
            this.config.customTransport(entry);
        }
    }

    /**
     * Log debug message
     */
    debug(message: string, context?: Record<string, unknown>): void {
        this.write({
            level: LogLevel.DEBUG,
            message,
            timestamp: new Date().toISOString(),
            context,
        });
    }

    /**
     * Log info message
     */
    info(message: string, context?: Record<string, unknown>): void {
        this.write({
            level: LogLevel.INFO,
            message,
            timestamp: new Date().toISOString(),
            context,
        });
    }

    /**
     * Log warning message
     */
    warn(message: string, context?: Record<string, unknown>): void {
        this.write({
            level: LogLevel.WARN,
            message,
            timestamp: new Date().toISOString(),
            context,
        });
    }

    /**
     * Log error message
     */
    error(message: string, error?: Error, context?: Record<string, unknown>): void {
        this.write({
            level: LogLevel.ERROR,
            message,
            timestamp: new Date().toISOString(),
            context,
            error,
        });
    }

    /**
     * Create a child logger with additional context
     */
    child(defaultContext: Record<string, unknown>): Logger {
        const childLogger = new Logger(this.config);
        const originalWrite = childLogger.write.bind(childLogger);

        childLogger.write = (entry: LogEntry) => {
            originalWrite({
                ...entry,
                context: { ...defaultContext, ...entry.context },
            });
        };

        return childLogger;
    }
}

/**
 * Default logger instance
 */
export const logger = Logger.getInstance();

/**
 * Create a logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
    return new Logger(config);
}
