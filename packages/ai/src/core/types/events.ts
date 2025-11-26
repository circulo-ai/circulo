/**
 * Narrow event interfaces for orchestration and plugin hooks.
 */

import { Metadata, Priority } from '../../types/common';

export type EventKind =
    | 'agent.plan'
    | 'agent.act'
    | 'agent.reflect'
    | 'tool.invoke'
    | 'orchestrator.handoff'
    | 'orchestrator.error'
    | 'task.created'
    | 'task.completed'
    | 'task.failed'
    | 'custom';

export interface SDKEvent {
    id: string;
    kind: EventKind;
    source: string;
    sourceId?: string;
    timestamp: string;
    payload: Record<string, unknown>;
    priority?: Priority;
    metadata?: Metadata;
}

export type EventHandler = (event: SDKEvent) => Promise<void> | void;

export interface EventFilter {
    kinds?: EventKind[];
    sources?: string[];
    sourceIds?: string[];
    priority?: Priority;
    custom?: (event: SDKEvent) => boolean;
}
