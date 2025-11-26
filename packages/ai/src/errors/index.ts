/**
 * Strongly typed error classes for the SDK
 */

/**
 * Base SDK error class
 */
export class SDKError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'SDKError';
        Object.setPrototypeOf(this, SDKError.prototype);
    }
}

/**
 * Validation error for invalid inputs
 */
export class ValidationError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

/**
 * Not found error for missing entities
 */
export class NotFoundError extends SDKError {
    constructor(entityType: string, id: string) {
        super(`${entityType} with id '${id}' not found`, 'NOT_FOUND', { entityType, id });
        this.name = 'NotFoundError';
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}

/**
 * Conflict error for duplicate or conflicting operations
 */
export class ConflictError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'CONFLICT', details);
        this.name = 'ConflictError';
        Object.setPrototypeOf(this, ConflictError.prototype);
    }
}

/**
 * Permission error for unauthorized operations
 */
export class PermissionError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'PERMISSION_DENIED', details);
        this.name = 'PermissionError';
        Object.setPrototypeOf(this, PermissionError.prototype);
    }
}

/**
 * Network/communication error
 */
export class CommunicationError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'COMMUNICATION_ERROR', details);
        this.name = 'CommunicationError';
        Object.setPrototypeOf(this, CommunicationError.prototype);
    }
}

/**
 * State error for invalid state transitions
 */
export class StateError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'INVALID_STATE', details);
        this.name = 'StateError';
        Object.setPrototypeOf(this, StateError.prototype);
    }
}

/**
 * Configuration error
 */
export class ConfigurationError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'CONFIGURATION_ERROR', details);
        this.name = 'ConfigurationError';
        Object.setPrototypeOf(this, ConfigurationError.prototype);
    }
}

/**
 * Orchestration error for multi-agent coordination failures
 */
export class OrchestrationError extends SDKError {
    constructor(message: string, details?: unknown) {
        super(message, 'ORCHESTRATION_ERROR', details);
        this.name = 'OrchestrationError';
        Object.setPrototypeOf(this, OrchestrationError.prototype);
    }
}

/**
 * Helper to create Result from try-catch
 */
export function tryCatch<T>(fn: () => T): { success: true; value: T } | { success: false; error: Error } {
    try {
        return { success: true, value: fn() };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}

/**
 * Async version of tryCatch
 */
export async function tryCatchAsync<T>(
    fn: () => Promise<T>
): Promise<{ success: true; value: T } | { success: false; error: Error }> {
    try {
        return { success: true, value: await fn() };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
