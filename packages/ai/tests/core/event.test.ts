/**
 * Event system tests
 */

import { InMemoryEventBus } from '../../src/orchestration/event-bus';
import { EventType, Event } from '../../src/core/event';
import { Priority } from '../../src/types/common';
import { wait } from '../helpers';

describe('Event System', () => {
    let eventBus: InMemoryEventBus;

    beforeEach(() => {
        eventBus = new InMemoryEventBus();
    });

    describe('publish and subscribe', () => {
        it('should publish events to subscribers', async () => {
            const handler = jest.fn();
            eventBus.subscribe({ types: [EventType.CUSTOM] }, handler);

            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'test',
                payload: { data: 'test' },
            });

            expect(handler).toHaveBeenCalledTimes(1);
            const event = handler.mock.calls[0][0];
            expect(event.type).toBe(EventType.CUSTOM);
            expect(event.payload).toEqual({ data: 'test' });
        });

        it('should filter events by type', async () => {
            const handler = jest.fn();
            eventBus.subscribe({ types: [EventType.AGENT_CREATED] }, handler);

            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'test',
                payload: {},
            });

            expect(handler).not.toHaveBeenCalled();
        });

        it('should filter events by source', async () => {
            const handler = jest.fn();
            eventBus.subscribe({ sources: ['agent-1'] }, handler);

            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'agent-2',
                payload: {},
            });

            expect(handler).not.toHaveBeenCalled();

            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'agent-1',
                payload: {},
            });

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('priority', () => {
        it('should handle high priority subscriptions first', async () => {
            const executionOrder: string[] = [];

            eventBus.subscribe(
                { types: [EventType.CUSTOM] },
                async () => { executionOrder.push('normal'); },
                Priority.NORMAL
            );

            eventBus.subscribe(
                { types: [EventType.CUSTOM] },
                async () => { executionOrder.push('high'); },
                Priority.HIGH
            );

            eventBus.subscribe(
                { types: [EventType.CUSTOM] },
                async () => { executionOrder.push('low'); },
                Priority.LOW
            );

            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'test',
                payload: {},
            });

            expect(executionOrder).toEqual(['high', 'normal', 'low']);
        });
    });

    describe('history', () => {
        it('should store event history', async () => {
            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'test',
                payload: { id: 1 },
            });

            await eventBus.publish({
                type: EventType.CUSTOM,
                source: 'test',
                payload: { id: 2 },
            });

            const history = eventBus.getHistory();
            expect(history).toHaveLength(2);
            expect(history[0].payload.id).toBe(1);
            expect(history[1].payload.id).toBe(2);
        });

        it('should respect history limit', async () => {
            const smallBus = new InMemoryEventBus(2);

            await smallBus.publish({ type: EventType.CUSTOM, source: 'test', payload: { id: 1 } });
            await smallBus.publish({ type: EventType.CUSTOM, source: 'test', payload: { id: 2 } });
            await smallBus.publish({ type: EventType.CUSTOM, source: 'test', payload: { id: 3 } });

            const history = smallBus.getHistory();
            expect(history).toHaveLength(2);
            expect(history[0].payload.id).toBe(2);
            expect(history[1].payload.id).toBe(3);
        });
    });

    describe('unsubscribe', () => {
        it('should stop receiving events after unsubscribe', async () => {
            const handler = jest.fn();
            const subId = eventBus.subscribe({ types: [EventType.CUSTOM] }, handler);

            await eventBus.publish({ type: EventType.CUSTOM, source: 'test', payload: {} });
            expect(handler).toHaveBeenCalledTimes(1);

            eventBus.unsubscribe(subId);

            await eventBus.publish({ type: EventType.CUSTOM, source: 'test', payload: {} });
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });
});
