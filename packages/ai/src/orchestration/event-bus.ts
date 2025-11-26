/**
 * Event bus implementation
 */

import EventEmitter from 'eventemitter3';
import { Event, EventFilter, EventHandler, EventSubscription, EventBus } from '../core/event';
import { ID, Priority } from '../types/common';
import { logger } from '../utils/logger';

/**
 * In-memory event bus implementation
 */
export class InMemoryEventBus extends EventEmitter implements EventBus {
    private subscriptions: Map<ID, EventSubscription> = new Map();
    private eventHistory: Event[] = [];
    private maxHistorySize: number;

    constructor(maxHistorySize: number = 1000) {
        super();
        this.maxHistorySize = maxHistorySize;
    }

    /**
     * Publish an event
     */
    async publish(event: Omit<Event, 'id' | 'timestamp'>): Promise<void> {
        const fullEvent: Event = {
            ...event,
            id: this.generateEventId(),
            timestamp: new Date().toISOString(),
        };

        // Add to history
        this.eventHistory.push(fullEvent);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }

        // Emit to EventEmitter listeners
        this.emit('event', fullEvent);
        this.emit(fullEvent.type, fullEvent);

        // Process subscriptions
        const matchingSubscriptions = this.getMatchingSubscriptions(fullEvent);

        // Sort by priority (higher priority first)
        matchingSubscriptions.sort((a, b) => {
            const priorityA = a.priority ?? Priority.NORMAL;
            const priorityB = b.priority ?? Priority.NORMAL;
            return priorityB - priorityA;
        });

        // Execute handlers
        for (const subscription of matchingSubscriptions) {
            try {
                await subscription.handler(fullEvent);
            } catch (error) {
                logger.error(
                    `Error in event handler for subscription ${subscription.id}`,
                    error instanceof Error ? error : undefined,
                    { subscriptionId: subscription.id, eventType: fullEvent.type }
                );
                this.emit('error', { subscription, event: fullEvent, error });
            }
        }
    }

    /**
     * Subscribe to events
     */
    subscribe(filter: EventFilter, handler: EventHandler, priority?: Priority): ID {
        const subscription: EventSubscription = {
            id: this.generateSubscriptionId(),
            filter,
            handler,
            priority,
        };

        this.subscriptions.set(subscription.id, subscription);
        this.emit('subscription:added', subscription);

        return subscription.id;
    }

    /**
     * Unsubscribe from events
     */
    unsubscribe(subscriptionId: ID): boolean {
        const deleted = this.subscriptions.delete(subscriptionId);
        if (deleted) {
            this.emit('subscription:removed', subscriptionId);
        }
        return deleted;
    }

    /**
     * Get all active subscriptions
     */
    getSubscriptions(): EventSubscription[] {
        return Array.from(this.subscriptions.values());
    }

    /**
     * Clear all subscriptions
     */
    clearSubscriptions(): void {
        this.subscriptions.clear();
        this.emit('subscriptions:cleared');
    }

    /**
     * Get event history
     */
    getHistory(filter?: EventFilter, limit?: number): Event[] {
        let events = [...this.eventHistory];

        if (filter) {
            events = events.filter((event) => this.matchesFilter(event, filter));
        }

        if (limit) {
            events = events.slice(-limit);
        }

        return events;
    }

    /**
     * Clear event history
     */
    clearHistory(): void {
        this.eventHistory = [];
        this.emit('history:cleared');
    }

    /**
     * Get matching subscriptions for an event
     */
    private getMatchingSubscriptions(event: Event): EventSubscription[] {
        return Array.from(this.subscriptions.values()).filter((subscription) =>
            this.matchesFilter(event, subscription.filter)
        );
    }

    /**
     * Check if event matches filter
     */
    private matchesFilter(event: Event, filter: EventFilter): boolean {
        // Check event types
        if (filter.types && filter.types.length > 0) {
            if (!filter.types.includes(event.type)) {
                return false;
            }
        }

        // Check sources
        if (filter.sources && filter.sources.length > 0) {
            if (!filter.sources.includes(event.source)) {
                return false;
            }
        }

        // Check source IDs
        if (filter.sourceIds && filter.sourceIds.length > 0) {
            if (!event.sourceId || !filter.sourceIds.includes(event.sourceId)) {
                return false;
            }
        }

        // Check priority
        if (filter.priority !== undefined) {
            if (event.priority !== filter.priority) {
                return false;
            }
        }

        // Check custom filter
        if (filter.custom) {
            if (!filter.custom(event)) {
                return false;
            }
        }

        return true;
    }

    private generateEventId(): ID {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateSubscriptionId(): ID {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
