import {
  defineDurableWorkflow,
  InMemoryTaskQueue,
  InMemoryWorkflowHistoryStore,
  ReplayWorkflowRunner,
  type ReplayWorkflowDefinition,
} from "@circulo-ai/wf";

export interface OrderInput {
  orderId: string;
}

/**
 * A side-effect-free example definition. Register real activities in the
 * application before starting it with a durable runner and queue.
 */
export const orderFulfillment: ReplayWorkflowDefinition<OrderInput, string> =
  defineDurableWorkflow({
    name: "order-fulfillment",
    version: 1,
    run: async (wf, input) => {
      await wf.sleep("wait-for-fulfillment", "3 days");
      return `ready:${input.orderId}`;
    },
  });

export function createLocalExampleRunner(): ReplayWorkflowRunner {
  return new ReplayWorkflowRunner(
    new InMemoryWorkflowHistoryStore(),
    new InMemoryTaskQueue(),
  );
}
