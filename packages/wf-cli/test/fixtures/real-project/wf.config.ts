import {
  defineWfConfig,
  InMemoryWorkflowStepRegistry,
  type IWorkflowStep,
  type WorkflowStepContext,
} from "@circulo-ai/wf";

type Data = { readonly greeting?: string };

class HelloStep implements IWorkflowStep<Data, string> {
  async execute(context: WorkflowStepContext<Data>): Promise<string> {
    return `${context.data.greeting ?? "Hello"}, ${String(context.input ?? "world")}`;
  }
}

class GoodbyeStep implements IWorkflowStep<Data, string> {
  async execute(context: WorkflowStepContext<Data>): Promise<string> {
    return `${String(context.input ?? "world")} goodbye`;
  }
}

const registry = new InMemoryWorkflowStepRegistry();
registry.register("demo.Hello", () => new HelloStep());
registry.register("demo.Goodbye", () => new GoodbyeStep());

export default defineWfConfig({
  registry,
  profiles: {
    test: async () => ({ name: "real-project" }),
  },
  defaultProfile: "test",
  workflows: { helloWorld: "workflows/hello-world.json" },
});
