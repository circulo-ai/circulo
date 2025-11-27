# AI CLI - Production-Ready Multi-Agent Orchestration

A complete CLI tool demonstrating all features of the AI orchestration SDK.

## Features

✅ **Multi-Agent Orchestration**
- Research, Code, and Analysis agents
- Sequential, parallel, and consensus strategies
- Agent hand-offs and collaboration

✅ **Tool Integration**
- Calculator, file search, and extensible tools
- MCP server support
- Custom tool creation

✅ **Memory & Context**
- Agent memory with RAG
- Vector-based semantic search
- Conversation history management

✅ **Scheduling**
- Cron-based scheduling
- One-time and interval tasks
- Task management dashboard

✅ **Human-in-the-Loop**
- Approval workflows
- Web-based approval dashboard
- Configurable approval policies

✅ **Resilience**
- Automatic retries with exponential backoff
- Circuit breakers for failing services
- Timeout protection

✅ **Streaming**
- Real-time response streaming
- Progressive results
- WebSocket support ready

## Installation

```bash
cd examples/cli
npm install
npm run build

# Or for development
npm run dev -- <command>
```

## Quick Start

### 1. Configure

```bash
ai-cli configure --openai-key sk-... --model gpt-4o
```

### 2. Interactive Chat

```bash
# Start chat with streaming
ai-cli chat --stream

# Use specific agent
ai-cli chat --agent code-agent
```

### 3. Execute Tasks

```bash
# Simple task with single agent
ai-cli execute "Research the latest AI trends"

# Multi-agent task with parallel execution
ai-cli execute "Analyze and code a solution for data processing" \
  --strategy parallel \
  --agents research-agent code-agent

# Consensus strategy (multiple agents vote)
ai-cli execute "Should we migrate to microservices?" \
  --strategy consensus

# Require approval
ai-cli execute "Delete all temporary files" --approval
```

### 4. Schedule Tasks

```bash
# Run daily at 9 AM
ai-cli schedule "Generate daily report" --cron "0 9 * * *"

# Run once at specific time
ai-cli schedule "Backup database" --at "2024-12-31T23:59:00"

# Run every hour
ai-cli schedule "Check system health" --interval 3600000
```

### 5. List Resources

```bash
# List available agents
ai-cli list agents

# List available tools
ai-cli list tools

# List scheduled tasks
ai-cli list tasks
```

### 6. View Statistics

```bash
ai-cli stats
```

### 7. Export Conversations

```bash
ai-cli export conv_123 ./conversation.json
```

## Configuration

Configuration is stored in `~/.ai-cli/config.json`:

```json
{
  "openaiKey": "sk-...",
  "anthropicKey": "sk-ant-...",
  "defaultModel": "gpt-4o",
  "defaultProvider": "openai",
  "dataDir": "~/.ai-cli/data",
  "approvalRequired": false,
  "maxRetries": 3
}
```

## Data Storage

All data is stored in `~/.ai-cli/data/`:

```
~/.ai-cli/data/
├── conversations/       # Conversation metadata
├── messages/           # Message history by conversation
│   └── conv_123/       # Messages for conversation
├── approvals/          # Approval requests
├── schedules/          # Scheduled tasks
├── webhooks/           # Webhook configurations
└── stats.json          # Usage statistics
```

## Approval Dashboard

When approvals are enabled, a web dashboard runs on `http://localhost:3001`:

```bash
# Enable approvals
ai-cli configure --approval

# Run a task requiring approval
ai-cli execute "Delete production database" --approval

# Approve/reject at http://localhost:3001
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   CLI Layer                      │
│  (commander, chalk, ora, readline)              │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│            Agent Orchestrator                    │
│  • Multi-agent coordination                     │
│  • Strategy-based execution                     │
│  • Tool invocation                              │
└────────────────┬────────────────────────────────┘
                 │
      ┌──────────┼──────────┐
      │          │          │
┌─────▼────┐ ┌──▼───┐ ┌───▼────┐
│ Research │ │ Code │ │Analysis│
│  Agent   │ │Agent │ │ Agent  │
└──────────┘ └──────┘ └────────┘
      │          │          │
      └──────────┼──────────┘
                 │
┌────────────────▼────────────────────────────────┐
│              Tool Registry                       │
│  • Calculator                                   │
│  • File Search                                  │
│  • Web Scraper                                  │
│  • MCP Tools                                    │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│         Storage & Memory Layer                   │
│  • File-based persistence                       │
│  • Vector store (semantic search)               │
│  • Conversation history                         │
│  • Agent memory (RAG)                           │
└─────────────────────────────────────────────────┘
```

## Advanced Usage

### Custom Agents

Create custom agents by implementing the `AgentRuntime` interface:

```typescript
const customAgent: AgentRuntime = {
    definition: {
        id: 'custom-agent',
        name: 'Custom Agent',
        description: 'Does custom things',
        systemPrompt: 'You are a custom agent...',
        model: 'gpt-4o',
    },
    act: async (input, ctx) => {
        // Your custom logic
        return {
            completion: 'Result',
            confidence: 0.9,
        };
    },
};
```

### Custom Tools

Create custom tools:

```typescript
const customTool = new SDKFunctionTool(
    {
        name: 'my_tool',
        description: 'Does something useful',
        parameters: { /* JSON Schema */ },
    },
    async (params) => {
        // Tool implementation
        return result;
    }
);
```

### Memory Integration

The CLI automatically uses memory for context:

- Short-term: Recent conversation in memory
- Long-term: Semantic search via vector store
- Auto-consolidation: Important memories persisted

### Resilience Patterns

All agent executions use:
- **Retry**: 3 attempts with exponential backoff
- **Timeout**: 60-90s per agent call
- **Circuit Breaker**: Prevents cascading failures

## Production Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
CMD ["node", "dist/cli.js"]
```

### Environment Variables

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export AI_CLI_DATA_DIR=/data
export AI_CLI_APPROVAL_PORT=3001
```

### Monitoring

The CLI logs all operations and tracks:
- Token usage per request
- Task completion rates
- Storage size
- Agent performance

## Troubleshooting

### Reset Configuration

```bash
rm -rf ~/.ai-cli
ai-cli configure --openai-key sk-...
```

### View Logs

Logs are output to stdout/stderr. For production:

```bash
ai-cli chat 2>&1 | tee cli.log
```

### Debug Mode

Set `DEBUG=*` for verbose logging:

```bash
DEBUG=* ai-cli execute "test task"
```

## Contributing

This is a complete example demonstrating SDK capabilities. Customize and extend for your needs!

## License

MIT
