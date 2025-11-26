/**
 * Test utilities and helpers
 */

import { Agent, AgentConfig } from '../src/core/agent';
import { Conversation, ConversationConfig } from '../src/core/conversation';
import { Tool, ToolConfig, ToolExecutor } from '../src/core/tool';
import { Task, TaskConfig } from '../src/core/task';
import { Integration, IntegrationConfig, IntegrationType } from '../src/core/integration';
import { Priority } from '../src/types/common';

/**
 * Create a test agent with default configuration
 */
export function createTestAgent(overrides?: Partial<AgentConfig>): Agent {
    const config: AgentConfig = {
        name: 'Test Agent',
        description: 'A test agent',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        capabilities: [
            { name: 'test-capability', description: 'Test capability' },
        ],
        ...overrides,
    };
    return new Agent(config);
}

/**
 * Create a test conversation
 */
export function createTestConversation(overrides?: Partial<ConversationConfig>): Conversation {
    const config: ConversationConfig = {
        title: 'Test Conversation',
        description: 'A test conversation',
        ...overrides,
    };
    return new Conversation(config);
}

/**
 * Create a test tool
 */
export function createTestTool(overrides?: Partial<ToolConfig>): Tool {
    const executor: ToolExecutor = async (params) => ({
        success: true,
        data: params,
    });

    const config: ToolConfig = {
        name: 'test-tool',
        description: 'A test tool',
        parameters: [
            { name: 'input', type: 'string', required: true },
        ],
        ...overrides,
    };

    return new Tool(config, executor);
}

/**
 * Create a test task
 */
export function createTestTask(overrides?: Partial<TaskConfig>): Task {
    const config: TaskConfig = {
        name: 'Test Task',
        description: 'A test task',
        priority: Priority.NORMAL,
        ...overrides,
    };
    return new Task(config);
}

/**
 * Create a test integration
 */
export function createTestIntegration(overrides?: Partial<IntegrationConfig>): Integration {
    const config: IntegrationConfig = {
        name: 'Test Integration',
        type: IntegrationType.API,
        description: 'A test integration',
        ...overrides,
    };
    return new Integration(config);
}

/**
 * Wait for a specified time
 */
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock tool executor that returns specific data
 */
export function createMockExecutor(data: any): ToolExecutor {
    return async () => ({
        success: true,
        data,
    });
}

/**
 * Create a mock tool executor that fails
 */
export function createFailingExecutor(error: string): ToolExecutor {
    return async () => ({
        success: false,
        error,
    });
}
