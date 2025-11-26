/**
 * Common type definitions used across the SDK
 */

/**
 * Unique identifier type
 */
export type ID = string;

/**
 * ISO 8601 timestamp
 */
export type Timestamp = string;

/**
 * Metadata map for extensible properties
 */
export type Metadata = Record<string, unknown>;

/**
 * Result type for functional error handling
 * @template T Success value type
 * @template E Error type
 */
export type Result<T, E = Error> =
    | { success: true; value: T }
    | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Pagination parameters
 */
export interface PaginationParams {
    page?: number;
    limit?: number;
    cursor?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasNext: boolean;
    cursor?: string;
}

/**
 * Filter and sort options
 */
export interface QueryOptions {
    filter?: Record<string, unknown>;
    sort?: {
        field: string;
        order: 'asc' | 'desc';
    };
    pagination?: PaginationParams;
}

/**
 * Base entity interface with common fields
 */
export interface BaseEntity {
    id: ID;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;
}

/**
 * Lifecycle state for entities
 */
export enum EntityState {
    CREATED = 'created',
    ACTIVE = 'active',
    PAUSED = 'paused',
    ARCHIVED = 'archived',
    DELETED = 'deleted',
}

/**
 * Priority levels for tasks and events
 */
export enum Priority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    CRITICAL = 3,
}

/**
 * Task ordering strategies
 */
export enum TaskOrdering {
    FIFO = 'fifo',
    LIFO = 'lifo',
    PRIORITY = 'priority',
    CUSTOM = 'custom',
}
