import { describe, expect, it } from "vitest";
import {
  getExplicitlyMentionedAgentIds,
  hasExplicitAgentDirective,
  shouldEngageAgents,
} from "./agent-engagement";

const agent = {
  agent: { id: "research-agent", name: "Research Lead" },
} as never;

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
});
