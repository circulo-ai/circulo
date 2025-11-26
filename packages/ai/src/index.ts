/**
 * Main SDK entry point - exports core SDK APIs only
 * For Next.js integration, import from '@ai-platform/sdk/nextjs'
 */

// Core entities
export { Agent, type IAgent, type AgentConfig, type AgentCapability, type AgentContext, type AgentMessage, type AgentResponse, type AgentLifecycleHooks } from './core/agent';
export { Conversation, type IConversation, type ConversationConfig, type Participant, ParticipantType, type ConversationSummary } from './core/conversation';
export { Tool, type ITool, type ToolConfig, type ToolParameter, type ToolExecutor, type ToolExecutionContext, type ToolExecutionResult } from './core/tool';
export { Integration, type IIntegration, type IntegrationConfig, IntegrationType } from './core/integration';
export { Task, type ITask, type TaskConfig, type TaskResult, type TaskDependency, TaskStatus } from './core/task';
export { Artifact, type IArtifact, type ArtifactConfig, type ArtifactLocation, ArtifactType } from './core/artifact';
export { KnowledgeBase, type IKnowledgeBase, type KnowledgeBaseConfig, type KnowledgeBaseDriver, type Document, type Embedding, type SearchResult, DocumentType, InMemoryKnowledgeBaseDriver } from './core/knowledge-base';

// Event system
export { type Event, type EventHandler, type EventFilter, type EventSubscription, type EventBus, type EventScheduler, type WebhookManager, type ScheduledEvent, type ScheduledEventConfig, type Webhook, type WebhookConfig, EventType } from './core/event';

// Orchestration
export { Orchestrator, type IOrchestrator, type OrchestratorConfig, type OrchestrationContext, type AgentExecutionResult, OrchestrationStrategy } from './orchestration/orchestrator';
export { TaskScheduler, type ITaskScheduler, type TaskQueueConfig } from './orchestration/task-scheduler';
export { InMemoryEventBus } from './orchestration/event-bus';

// Storage
export { type StorageAdapter, InMemoryStorageAdapter, FileStorageAdapter, StorageManager } from './storage/adapters';

// Plugin system
export { PluginManager, BasePlugin, ToolPlugin, EventHandlerPlugin, type Plugin, type PluginMetadata, type PluginContext, PluginType } from './plugins/plugin-manager';

// Types
export { type ID, type Timestamp, type Metadata, type Result, type AsyncResult, type PaginationParams, type PaginatedResponse, type QueryOptions, type BaseEntity, EntityState, Priority, TaskOrdering } from './types/common';

// Errors
export { SDKError, ValidationError, NotFoundError, ConflictError, PermissionError, CommunicationError, StateError, ConfigurationError, OrchestrationError, tryCatch, tryCatchAsync } from './errors';

// Main client
export { AISDKClient, type SDKConfig } from './client';
