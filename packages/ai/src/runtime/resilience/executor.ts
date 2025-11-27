/**
 * Resilience patterns: retry, circuit breaker, timeout, fallback
 */

export interface RetryConfig {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableErrors?: ((error: unknown) => boolean)[];
    onRetry?: (attempt: number, error: unknown) => void;
}

export interface CircuitBreakerConfig {
    failureThreshold?: number; // failures before opening circuit
    resetTimeoutMs?: number; // time before attempting to close circuit
    halfOpenMaxAttempts?: number; // max attempts in half-open state
    onStateChange?: (state: CircuitState) => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface TimeoutConfig {
    timeoutMs: number;
    signal?: AbortSignal; // for fetch cancellation
}

/**
 * Retry with exponential backoff
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        initialDelayMs = 1000,
        maxDelayMs = 30000,
        backoffMultiplier = 2,
        retryableErrors = [isTransientError],
        onRetry,
    } = config;

    let lastError: unknown;
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if error is retryable
            const shouldRetry = retryableErrors.some(check => check(error));

            if (!shouldRetry || attempt === maxAttempts) {
                throw error;
            }

            onRetry?.(attempt, error);

            // Wait before retry
            await sleep(Math.min(delay, maxDelayMs));
            delay *= backoffMultiplier;
        }
    }

    throw lastError;
}

/**
 * Circuit breaker pattern to prevent cascading failures
 */
export class CircuitBreaker {
    private state: CircuitState = 'closed';
    private failureCount = 0;
    private lastFailureTime = 0;
    private halfOpenAttempts = 0;

    constructor(private readonly config: CircuitBreakerConfig = {}) {
        this.config.failureThreshold ??= 5;
        this.config.resetTimeoutMs ??= 60000;
        this.config.halfOpenMaxAttempts ??= 3;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'open') {
            // Check if we should transition to half-open
            const now = Date.now();
            if (now - this.lastFailureTime >= this.config.resetTimeoutMs!) {
                this.transitionTo('half-open');
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        if (this.state === 'half-open') {
            this.halfOpenAttempts++;
            if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts!) {
                this.transitionTo('closed');
                this.failureCount = 0;
                this.halfOpenAttempts = 0;
            }
        } else if (this.state === 'closed') {
            this.failureCount = 0;
        }
    }

    private onFailure(): void {
        this.lastFailureTime = Date.now();
        this.failureCount++;

        if (this.state === 'half-open') {
            this.transitionTo('open');
            this.halfOpenAttempts = 0;
        } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold!) {
            this.transitionTo('open');
        }
    }

    private transitionTo(newState: CircuitState): void {
        if (this.state !== newState) {
            this.state = newState;
            this.config.onStateChange?.(newState);
        }
    }

    getState(): CircuitState {
        return this.state;
    }

    reset(): void {
        this.state = 'closed';
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
    }
}

/**
 * Timeout wrapper with cancellation support
 */
export async function withTimeout<T>(
    fn: () => Promise<T>,
    config: TimeoutConfig
): Promise<T> {
    const controller = new AbortController();
    const combinedSignal = config.signal
        ? combineAbortSignals([config.signal, controller.signal])
        : controller.signal;

    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        // If fn accepts signal, pass it
        const result = await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
                combinedSignal.addEventListener('abort', () => {
                    reject(new Error(`Operation timed out after ${config.timeoutMs}ms`));
                });
            }),
        ]);

        return result;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fallback pattern - try primary, fall back to secondary
 */
export async function withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    shouldFallback?: (error: unknown) => boolean
): Promise<T> {
    try {
        return await primary();
    } catch (error) {
        if (shouldFallback && !shouldFallback(error)) {
            throw error;
        }
        return await fallback();
    }
}

/**
 * Combine all resilience patterns
 */
export interface ResilientExecutionConfig {
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreakerConfig;
    timeout?: TimeoutConfig;
    fallback?: () => Promise<any>;
}

export class ResilientExecutor {
    private circuitBreakers = new Map<string, CircuitBreaker>();

    async execute<T>(
        key: string,
        fn: () => Promise<T>,
        config: ResilientExecutionConfig = {}
    ): Promise<T> {
        let operation = fn;

        // Wrap with timeout if configured
        if (config.timeout) {
            const timeoutFn = operation;
            operation = () => withTimeout(timeoutFn, config.timeout!);
        }

        // Wrap with circuit breaker if configured
        if (config.circuitBreaker) {
            let breaker = this.circuitBreakers.get(key);
            if (!breaker) {
                breaker = new CircuitBreaker(config.circuitBreaker);
                this.circuitBreakers.set(key, breaker);
            }
            const breakerFn = operation;
            operation = () => breaker!.execute(breakerFn);
        }

        // Wrap with retry if configured
        if (config.retry) {
            const retryFn = operation;
            operation = () => withRetry(retryFn, config.retry);
        }

        // Execute with optional fallback
        if (config.fallback) {
            return withFallback(operation, config.fallback);
        }

        return operation();
    }

    getCircuitBreakerState(key: string): CircuitState | undefined {
        return this.circuitBreakers.get(key)?.getState();
    }

    resetCircuitBreaker(key: string): void {
        this.circuitBreakers.get(key)?.reset();
    }
}

// Helpers

function isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnreset') ||
            message.includes('econnrefused') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('504') ||
            message.includes('rate limit')
        );
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort();
            break;
        }
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return controller.signal;
}
