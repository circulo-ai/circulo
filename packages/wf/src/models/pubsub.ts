import type { WorkflowEvent } from "./workflow";

export type EventCallback<TOutput> = (
  evt: WorkflowEvent<TOutput>,
) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventBus<TOutput> {
  publish(evt: WorkflowEvent<TOutput>): Promise<void>;
  subscribe(workflowId: string, cb: EventCallback<TOutput>): Unsubscribe;
  subscribeAll(cb: EventCallback<TOutput>): Unsubscribe;
}
