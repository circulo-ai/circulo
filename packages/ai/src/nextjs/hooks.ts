/**
 * React hooks for Next.js integration
 */

'use client';

import { useEffect, useState, useCallback, useContext } from 'react';
import { ID } from '../types/common';
import { Agent, IAgent, AgentConfig } from '../core/agent';
import { Conversation, IConversation, ConversationConfig } from '../core/conversation';
import { Task, ITask, TaskConfig } from '../core/task';
import { SDKContext } from './context';

/**
 * Hook to access the SDK instance
 */
export function useSDK() {
    const context = useContext(SDKContext);
    if (!context) {
        throw new Error('useSDK must be used within an SDKProvider');
    }
    return context;
}

/**
 * Hook to manage an agent
 */
export function useAgent(agentId?: ID) {
    const { sdk } = useSDK();
    const [agent, setAgent] = useState<IAgent | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!agentId) return;

        setLoading(true);
        sdk.storage.agents
            .get(agentId)
            .then((data) => {
                setAgent(data);
                setError(null);
            })
            .catch((err) => {
                setError(err);
                setAgent(null);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [agentId, sdk]);

    const createAgent = useCallback(
        async (config: AgentConfig): Promise<IAgent | null> => {
            setLoading(true);
            try {
                const newAgent = new Agent(config);
                const created = await sdk.storage.agents.create(newAgent.toJSON());
                sdk.orchestrator.registerAgent(new Agent(config, created.id));
                setAgent(created);
                setError(null);
                return created;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [sdk]
    );

    const updateAgent = useCallback(
        async (updates: Partial<AgentConfig>): Promise<IAgent | null> => {
            if (!agent) return null;

            setLoading(true);
            try {
                const updated = await sdk.storage.agents.update(agent.id, updates);
                setAgent(updated);
                setError(null);
                return updated;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [agent, sdk]
    );

    const deleteAgent = useCallback(async (): Promise<boolean> => {
        if (!agent) return false;

        setLoading(true);
        try {
            const deleted = await sdk.storage.agents.delete(agent.id);
            if (deleted) {
                sdk.orchestrator.unregisterAgent(agent.id);
                setAgent(null);
            }
            setError(null);
            return deleted;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            return false;
        } finally {
            setLoading(false);
        }
    }, [agent, sdk]);

    return {
        agent,
        loading,
        error,
        createAgent,
        updateAgent,
        deleteAgent,
    };
}

/**
 * Hook to manage a conversation
 */
export function useConversation(conversationId?: ID) {
    const { sdk } = useSDK();
    const [conversation, setConversation] = useState<IConversation | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!conversationId) return;

        setLoading(true);
        sdk.storage.conversations
            .get(conversationId)
            .then((data) => {
                setConversation(data);
                setError(null);
            })
            .catch((err) => {
                setError(err);
                setConversation(null);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [conversationId, sdk]);

    const createConversation = useCallback(
        async (config: ConversationConfig): Promise<IConversation | null> => {
            setLoading(true);
            try {
                const newConversation = new Conversation(config);
                const created = await sdk.storage.conversations.create(newConversation.toJSON());
                setConversation(created);
                setError(null);
                return created;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [sdk]
    );

    const sendMessage = useCallback(
        async (message: string, userId?: ID): Promise<void> => {
            if (!conversation) return;

            setLoading(true);
            try {
                const conv = new Conversation(conversation as ConversationConfig, conversation.id);
                await sdk.orchestrator.coordinateConversation(conv, message, userId);
                setError(null);
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
            } finally {
                setLoading(false);
            }
        },
        [conversation, sdk]
    );

    return {
        conversation,
        loading,
        error,
        createConversation,
        sendMessage,
    };
}

/**
 * Hook to manage tasks
 */
export function useTask(taskId?: ID) {
    const { sdk } = useSDK();
    const [task, setTask] = useState<ITask | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!taskId) return;

        setLoading(true);
        sdk.storage.tasks
            .get(taskId)
            .then((data) => {
                setTask(data);
                setError(null);
            })
            .catch((err) => {
                setError(err);
                setTask(null);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [taskId, sdk]);

    const createTask = useCallback(
        async (config: TaskConfig): Promise<ITask | null> => {
            setLoading(true);
            try {
                const newTask = new Task(config);
                const created = await sdk.storage.tasks.create(newTask.toJSON());
                setTask(created);
                setError(null);
                return created;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [sdk]
    );

    return {
        task,
        loading,
        error,
        createTask,
    };
}

/**
 * Hook to list entities with pagination
 */
export function useList<T>(
    adapter: { list: (options?: any) => Promise<any> },
    options?: any
) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [hasNext, setHasNext] = useState(false);
    const [page, setPage] = useState(1);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adapter.list({ ...options, pagination: { ...options?.pagination, page } });
            setData(result.data);
            setHasNext(result.hasNext);
            setError(null);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
        } finally {
            setLoading(false);
        }
    }, [adapter, options, page]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const nextPage = useCallback(() => {
        if (hasNext) {
            setPage((p) => p + 1);
        }
    }, [hasNext]);

    const prevPage = useCallback(() => {
        setPage((p) => Math.max(1, p - 1));
    }, []);

    return {
        data,
        loading,
        error,
        hasNext,
        page,
        nextPage,
        prevPage,
        refresh: fetchData,
    };
}

/**
 * Hook to subscribe to events
 */
export function useEvents(filter: any, handler: (event: any) => void) {
    const { sdk } = useSDK();

    useEffect(() => {
        const subscriptionId = sdk.eventBus.subscribe(filter, handler);

        return () => {
            sdk.eventBus.unsubscribe(subscriptionId);
        };
    }, [sdk, filter, handler]);
}
