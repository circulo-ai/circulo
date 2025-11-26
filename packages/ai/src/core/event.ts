/**
 * Event system and event-based scheduling
 */

import { ID, Metadata, Priority, Timestamp } from "../types/common";

/**
 * Event type
 */
export enum EventType {
  // Agent events
  AGENT_CREATED = "agent.created",
  AGENT_ACTIVATED = "agent.activated",
  AGENT_PAUSED = "agent.paused",
  AGENT_DELETED = "agent.deleted",
  AGENT_MESSAGE = "agent.message",
  AGENT_TOOL_CALL = "agent.tool_call",

  // Conversation events
  CONVERSATION_CREATED = "conversation.created",
  CONVERSATION_MESSAGE = "conversation.message",
  CONVERSATION_PARTICIPANT_ADDED = "conversation.participant_added",
  CONVERSATION_PARTICIPANT_REMOVED = "conversation.participant_removed",

  // Task events
  TASK_CREATED = "task.created",
  TASK_STARTED = "task.started",
  TASK_COMPLETED = "task.completed",
  TASK_FAILED = "task.failed",
  TASK_CANCELLED = "task.cancelled",

  // Tool events
  TOOL_CREATED = "tool.created",
  TOOL_EXECUTED = "tool.executed",
  TOOL_FAILED = "tool.failed",
  TOOL_DELETED = "tool.deleted",

  // Integration events
  INTEGRATION_CREATED = "integration.created",
  INTEGRATION_ACTIVATED = "integration.activated",
  INTEGRATION_PAUSED = "integration.paused",
  INTEGRATION_DELETED = "integration.deleted",
  INTEGRATION_ERROR = "integration.error",

  // Artifact events
  ARTIFACT_CREATED = "artifact.created",
  ARTIFACT_UPDATED = "artifact.updated",
  ARTIFACT_DELETED = "artifact.deleted",

  // Knowledge Base events
  KNOWLEDGE_BASE_CREATED = "knowledge_base.created",
  KNOWLEDGE_BASE_DOCUMENT_ADDED = "knowledge_base.document_added",
  KNOWLEDGE_BASE_SEARCH = "knowledge_base.search",

  // System events
  SYSTEM_ERROR = "system.error",
  WEBHOOK_RECEIVED = "webhook.received",
  SCHEDULED_TRIGGER = "scheduled.trigger",

  // Custom events
  CUSTOM = "custom",
}

/**
 * Event interface
 */
export interface Event {
  id: ID;
  type: EventType;
  source: string;
  sourceId?: ID;
  timestamp: Timestamp;
  payload: Record<string, unknown>;
  priority?: Priority;
  metadata?: Metadata;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: Event) => Promise<void> | void;

/**
 * Event filter
 */
export interface EventFilter {
  types?: EventType[];
  sources?: string[];
  sourceIds?: ID[];
  priority?: Priority;
  custom?: (event: Event) => boolean;
}

/**
 * Event subscription
 */
export interface EventSubscription {
  id: ID;
  filter: EventFilter;
  handler: EventHandler;
  priority?: Priority;
}

/**
 * Scheduled event configuration
 */
export interface ScheduledEventConfig {
  type: EventType;
  source: string;
  payload: Record<string, unknown>;
  schedule: {
    type: "once" | "interval" | "cron";
    value: string | number; // ISO timestamp for 'once', milliseconds for 'interval', cron expression for 'cron'
  };
  enabled?: boolean;
  metadata?: Metadata;
}

/**
 * Scheduled event
 */
export interface ScheduledEvent extends ScheduledEventConfig {
  id: ID;
  nextRunAt?: Timestamp;
  lastRunAt?: Timestamp;
  runCount: number;
  createdAt: Timestamp;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  url: string;
  secret?: string;
  events: EventType[];
  headers?: Record<string, string>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  metadata?: Metadata;
}

/**
 * Webhook
 */
export interface Webhook extends WebhookConfig {
  id: ID;
  enabled: boolean;
  createdAt: Timestamp;
  lastTriggeredAt?: Timestamp;
  successCount: number;
  failureCount: number;
}

/**
 * Event bus interface
 */
export interface EventBus {
  /**
   * Publish an event
   */
  publish(event: Omit<Event, "id" | "timestamp">): Promise<void>;

  /**
   * Subscribe to events
   */
  subscribe(
    filter: EventFilter,
    handler: EventHandler,
    priority?: Priority
  ): ID;

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: ID): boolean;

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): EventSubscription[];

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void;
}

/**
 * Event scheduler interface
 */
export interface EventScheduler {
  /**
   * Schedule an event
   */
  schedule(config: ScheduledEventConfig): ID;

  /**
   * Cancel a scheduled event
   */
  cancel(eventId: ID): boolean;

  /**
   * Get a scheduled event
   */
  get(eventId: ID): ScheduledEvent | null;

  /**
   * List all scheduled events
   */
  list(): ScheduledEvent[];

  /**
   * Start the scheduler
   */
  start(): void;

  /**
   * Stop the scheduler
   */
  stop(): void;
}

/**
 * Webhook manager interface
 */
export interface WebhookManager {
  /**
   * Register a webhook
   */
  register(config: WebhookConfig): ID;

  /**
   * Unregister a webhook
   */
  unregister(webhookId: ID): boolean;

  /**
   * Get a webhook
   */
  get(webhookId: ID): Webhook | null;

  /**
   * List all webhooks
   */
  list(): Webhook[];

  /**
   * Trigger webhooks for an event
   */
  trigger(event: Event): Promise<void>;

  /**
   * Enable a webhook
   */
  enable(webhookId: ID): boolean;

  /**
   * Disable a webhook
   */
  disable(webhookId: ID): boolean;
}
