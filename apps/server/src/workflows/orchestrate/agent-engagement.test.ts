import { describe, expect, it } from "vitest";
import {
  getExplicitlyMentionedAgentIds,
  hasExplicitAgentDirective,
  hasExplicitToolDirective,
  shouldEngageAgents,
  shouldUseControllerDirectly,
} from "./agent-engagement";

const agent = {
  agent: { id: "research-agent", name: "Research Lead" },
};

function message(content: string) {
  return [{ role: "user", content }] as never;
}

describe("agent engagement fallback", () => {
  it("does not interrupt a human conversation for ordinary mentions", () => {
    expect(
      hasExplicitAgentDirective(message("@sara can you review this?"), [agent]),
    ).toBe(false);
    expect(
      hasExplicitAgentDirective(
        message("The agent on our team already replied."),
        [agent],
      ),
    ).toBe(false);
  });

  it("recognizes explicit generic agent directives", () => {
    expect(
      hasExplicitAgentDirective(message("@agent, summarize the thread."), [
        agent,
      ]),
    ).toBe(true);
    expect(
      hasExplicitAgentDirective(message("Assistant: please draft the reply."), [
        agent,
      ]),
    ).toBe(true);
  });

  it("recognizes an agent-specific mention or direct address", () => {
    expect(
      hasExplicitAgentDirective(message("@research-lead, find the source."), [
        agent,
      ]),
    ).toBe(true);
    expect(
      hasExplicitAgentDirective(
        message("Research Lead, please compare these."),
        [agent],
      ),
    ).toBe(true);
  });

  it("lets an explicit directive override a classifier false negative", () => {
    expect(
      shouldEngageAgents(false, message("@agent, summarize the thread."), [
        agent,
      ]),
    ).toBe(true);
    expect(
      shouldEngageAgents(
        false,
        message("The agent on our team already replied."),
        [agent],
      ),
    ).toBe(false);
  });

  it("returns only targeted agent IDs for named directives", () => {
    expect(
      getExplicitlyMentionedAgentIds(
        message("@research-lead, find the source."),
        [agent],
      ),
    ).toEqual(["research-agent"]);
    expect(
      getExplicitlyMentionedAgentIds(message("@agent, find the source."), [
        agent,
      ]),
    ).toEqual([]);
  });

  it("recognizes structured tool mentions without selecting a specialist", () => {
    expect(
      hasExplicitToolDirective(message("Please use the selected capability."), [
        { kind: "tool", key: "searchKnowledge" },
      ]),
    ).toBe(true);
    expect(
      getExplicitlyMentionedAgentIds(
        message("Ask the selected specialist."),
        [agent],
        [{ kind: "agent", key: "research-lead" }],
      ),
    ).toEqual(["research-agent"]);
    expect(
      shouldUseControllerDirectly({
        messages: message("Please use @tool:searchKnowledge."),
      }),
    ).toBe(true);
  });

  it("keeps controller-owned work local and allows explicit agents to opt in", () => {
    expect(
      shouldUseControllerDirectly({
        messages: message("How does our workflow orchestration loop work?"),
      }),
    ).toBe(true);
    expect(
      shouldUseControllerDirectly({
        messages: message("@research-lead, investigate workflow failures."),
        mentions: [{ kind: "agent", key: "research-agent" }],
      }),
    ).toBe(false);
    expect(
      shouldUseControllerDirectly({
        messages: message("@workflow-director, coordinate this request."),
        mentions: [{ kind: "agent", key: "workflow-director" }],
        orchestrationAgent: {
          id: "orchestrator-agent",
          name: "Workflow Director",
        },
      }),
    ).toBe(true);
    expect(
      shouldUseControllerDirectly({
        messages: message(
          "@workflow-director and @research-agent, investigate.",
        ),
        mentions: [
          { kind: "agent", key: "workflow-director" },
          { kind: "agent", key: "research-agent" },
        ],
        orchestrationAgent: {
          id: "orchestrator-agent",
          name: "Workflow Director",
        },
        agents: [
          {
            agent: {
              id: "orchestrator-agent",
              name: "Workflow Director",
            },
          },
          {
            agent: {
              id: "research-agent",
              name: "Research Agent",
            },
          },
        ],
      }),
    ).toBe(false);
  });
});
