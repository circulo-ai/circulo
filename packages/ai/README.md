# AI Platform SDK

A highly abstracted and modular TypeScript SDK for building AI platforms with multi-agent orchestration, conversation management, and extensible plugin architecture.

## Features

- ✨ **Custom AI Agent Creation** - Define and manage AI agents with capabilities, tools, and knowledge bases
- 💬 **Conversation Management** - Multi-agent, multi-user conversations with full history
- 🔧 **Tool & Integration System** - Pluggable tools and integrations (API, Database, MCP servers, etc.)
- 🧠 **Knowledge Base & Memory** - Document storage, embedding, and vector search
- 📋 **Task Delegation** - Assign and orchestrate tasks across multiple agents
- ⚡ **Event-Driven Architecture** - Event bus, webhooks, and scheduled triggers
- 🔌 **Plugin System** - Extensible architecture for custom functionality
- ⚛️ **Next.js Integration** - React hooks, providers, HOCs, and middleware
- 💾 **Pluggable Storage** - In-memory, file-based, or custom storage adapters
- 🎯 **Multi-Agent Orchestration** - Sequential, parallel, round-robin, and leader-follower strategies

## Installation

```bash
npm install @ai-platform/sdk
```

## Quick Start

### Standalone Usage

```typescript
import { AISDKClient, Agent, Conversation, Task } from '@ai-platform/sdk';

// Initialize SDK
const sdk = new AISDKClient({
  storageType: 'memory',
  taskScheduler: {
    ordering: 'priority',
    maxConcurrent: 5,
  },
});

await sdk.initialize();

// Create an agent
const agent = new Agent({
  name: 'Assistant',
  description: 'A helpful AI assistant',
  systemPrompt: 'You are a helpful assistant.',
  capabilities: [
    { name: 'text-generation', description: 'Generate text responses' },
  ],
});

await sdk.storage.agents.create(agent.toJSON());
sdk.orchestrator.registerAgent(agent);

// Create a conversation
const conversation = new Conversation({
  title: 'My Conversation',
  agentIds: [agent.id],
  userIds: ['user-123'],
});

await sdk.storage.conversations.create(conversation.toJSON());

// Send a message
await sdk.orchestrator.coordinateConversation(
  conversation,
  'Hello, how can you help me?',
  'user-123'
);
```

### Next.js Integration

```tsx
// app/layout.tsx
import { SDKProvider } from '@ai-platform/sdk';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <SDKProvider config={{ storageType: 'memory', autoInitialize: true }}>
          {children}
        </SDKProvider>
      </body>
    </html>
  );
}

// app/page.tsx
'use client';

import { useAgent, useConversation } from '@ai-platform/sdk';

export default function HomePage() {
  const { agent, createAgent, loading } = useAgent();
  const { conversation, createConversation, sendMessage } = useConversation();

  const handleCreateAgent = async () => {
    await createAgent({
      name: 'My Agent',
      systemPrompt: 'You are a helpful assistant',
    });
  };

  const handleSendMessage = async () => {
    if (conversation) {
      await sendMessage('Hello!', 'user-123');
    }
  };

  return (
    <div>
      <button onClick={handleCreateAgent} disabled={loading}>
        Create Agent
      </button>
      <button onClick={handleSendMessage} disabled={!conversation}>
        Send Message
      </button>
    </div>
  );
}
```

## Core Concepts

### Agents

Agents are AI entities with capabilities, tools, and knowledge bases.

```typescript
import { Agent, AgentConfig } from '@ai-platform/sdk';

const config: AgentConfig = {
  name: 'Research Agent',
  description: 'Specialized in research tasks',
  model: 'gpt-4',
  systemPrompt: 'You are a research assistant.',
  temperature: 0.7,
  capabilities: [
    { name: 'web-search', description: 'Search the web' },
    { name: 'summarization', description: 'Summarize documents' },
  ],
  tools: ['tool-id-1', 'tool-id-2'],
  knowledgeBases: ['kb-id-1'],
};

const agent = new Agent(config);
```

### Conversations

Conversations support multiple agents and users.

```typescript
import { Conversation, ParticipantType } from '@ai-platform/sdk';

const conversation = new Conversation({
  title: 'Team Discussion',
  agentIds: ['agent-1', 'agent-2'],
  userIds: ['user-1', 'user-2'],
});

// Add participants dynamically
conversation.addParticipant('agent-3', ParticipantType.AGENT);
```

### Tools

Tools are executable functions that agents can use.

```typescript
import { Tool, ToolExecutor } from '@ai-platform/sdk';

const executor: ToolExecutor = async (params, context) => {
  // Tool implementation
  const result = await someApiCall(params);
  return {
    success: true,
    data: result,
  };
};

const tool = new Tool(
  {
    name: 'web-search',
    description: 'Search the web for information',
    parameters: [
      { name: 'query', type: 'string', required: true },
      { name: 'limit', type: 'number', default: 10 },
    ],
  },
  executor
);

sdk.orchestrator.registerTool(tool);
```

### Knowledge Bases

Store and search documents with vector embeddings.

```typescript
import { KnowledgeBase, InMemoryKnowledgeBaseDriver, DocumentType } from '@ai-platform/sdk';

const kb = new KnowledgeBase({
  name: 'Product Documentation',
  driver: new InMemoryKnowledgeBaseDriver(),
  embeddingModel: 'text-embedding-ada-002',
});

await kb.initialize();

// Add documents
await kb.addDocument({
  title: 'Getting Started',
  content: 'This is the getting started guide...',
  type: DocumentType.MARKDOWN,
});

// Search
const results = await kb.searchByText('how to install', 5);
```

### Task Orchestration

Delegate tasks to agents with different strategies.

```typescript
import { Task, OrchestrationStrategy } from '@ai-platform/sdk';

const task = new Task({
  name: 'Analyze Data',
  description: 'Analyze the provided dataset',
  priority: Priority.HIGH,
  assignedAgentId: 'agent-1',
  input: { dataset: [...] },
});

// Execute with orchestration
const results = await sdk.orchestrator.executeTask(task, {
  agents: new Map([[agent.id, agent]]),
  tools: new Map(),
  variables: new Map(),
});
```

### Event System

Subscribe to events and trigger webhooks.

```typescript
import { EventType } from '@ai-platform/sdk';

// Subscribe to events
sdk.eventBus.subscribe(
  { types: [EventType.AGENT_MESSAGE] },
  async (event) => {
    console.log('Agent message:', event.payload);
  }
);

// Publish custom events
await sdk.eventBus.publish({
  type: EventType.CUSTOM,
  source: 'my-app',
  payload: { message: 'Hello' },
});
```

### Plugins

Extend the SDK with custom functionality.

```typescript
import { BasePlugin, PluginType } from '@ai-platform/sdk';

class MyPlugin extends BasePlugin {
  metadata = {
    name: 'my-plugin',
    version: '1.0.0',
    type: PluginType.CUSTOM,
  };

  async initialize(context) {
    // Register tools, subscribe to events, etc.
    context.subscribeToEvents(
      { types: [EventType.TASK_COMPLETED] },
      async (event) => {
        console.log('Task completed:', event);
      }
    );
  }
}

await sdk.pluginManager.register(new MyPlugin());
```

## API Reference

### Core Classes

- **`AISDKClient`** - Main SDK client
- **`Agent`** - AI agent entity
- **`Conversation`** - Multi-participant conversation
- **`Tool`** - Executable tool
- **`Integration`** - External integration
- **`Task`** - Delegatable task
- **`Artifact`** - Document/file artifact
- **`KnowledgeBase`** - Document storage and search

### Orchestration

- **`Orchestrator`** - Multi-agent coordination
- **`TaskScheduler`** - Task queue and execution
- **`InMemoryEventBus`** - Event pub/sub system

### Storage

- **`StorageAdapter`** - Storage interface
- **`InMemoryStorageAdapter`** - In-memory storage
- **`FileStorageAdapter`** - File-based storage
- **`StorageManager`** - Unified storage manager

### Next.js Utilities

- **`useSDK()`** - Access SDK instance
- **`useAgent(agentId?)`** - Manage agents
- **`useConversation(conversationId?)`** - Manage conversations
- **`useTask(taskId?)`** - Manage tasks
- **`useList(adapter, options)`** - Paginated lists
- **`useEvents(filter, handler)`** - Event subscriptions
- **`SDKProvider`** - Context provider
- **`withSDK(Component, config)`** - HOC wrapper
- **`agentMiddleware(config)`** - Next.js middleware

## Configuration

```typescript
const sdk = new AISDKClient({
  // Storage configuration
  storageType: 'memory' | 'file',
  filePath: './data',

  // Task scheduler
  taskScheduler: {
    ordering: 'fifo' | 'lifo' | 'priority' | 'custom',
    maxConcurrent: 5,
  },

  // Event bus
  eventBus: {
    maxHistorySize: 1000,
  },

  // Orchestration
  orchestration: {
    strategy: 'sequential' | 'parallel' | 'round_robin' | 'leader_follower',
    maxRetries: 3,
    timeout: 30000,
  },
});
```

## Error Handling

The SDK provides typed error classes and Result types.

```typescript
import { tryCatchAsync, ValidationError } from '@ai-platform/sdk';

// Using Result type
const result = await tryCatchAsync(async () => {
  return await sdk.storage.agents.get('agent-id');
});

if (result.success) {
  console.log('Agent:', result.value);
} else {
  console.error('Error:', result.error);
}

// Using try-catch
try {
  await sdk.storage.agents.create(agent.toJSON());
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.details);
  }
}
```

## License

MIT

## Contributing

Contributions are welcome! Please see CONTRIBUTING.md for details.
