import { expect, it } from "vitest";
import { workflowAssistantMessageId } from "./message-identity";

it("retains one valid assistant UUID across reconnects and worker restarts", () => {
  const id = workflowAssistantMessageId("wf-example");
  expect(id).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(workflowAssistantMessageId("wf-example")).toBe(id);
  expect(workflowAssistantMessageId("wf-other")).not.toBe(id);
});
