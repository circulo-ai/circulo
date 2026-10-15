export const COMPOSER_COMMAND_DEFINITIONS = [
  {
    command: "summarize",
    name: "Summarize",
    description: "Condense supplied content or this conversation",
    instruction:
      "Summarize the supplied content or the current conversation concisely. Preserve important decisions and facts. If no source is available, ask for it.",
  },
  {
    command: "explain",
    name: "Explain",
    description: "Explain a topic with clear examples",
    instruction:
      "Explain the supplied topic clearly, with useful examples and an appropriate level of detail. Ask for the topic if none is supplied.",
  },
  {
    command: "plan",
    name: "Make a plan",
    description: "Turn a goal into actionable steps",
    instruction:
      "Create an actionable plan for the supplied goal. Identify dependencies, risks, and the next step. Ask for the goal if none is supplied.",
  },
  {
    command: "compare",
    name: "Compare",
    description: "Compare alternatives and their tradeoffs",
    instruction:
      "Compare the supplied alternatives using relevant criteria and explain their tradeoffs. Ask for the alternatives if none are supplied.",
  },
] as const;

/** Applied to model context only; the original user message remains intact. */
export function expandComposerCommand(text: string): string {
  const match = text.match(/^\s*\/([a-z][\w-]*)(?:\s+|$)([\s\S]*)$/i);
  const command =
    match &&
    COMPOSER_COMMAND_DEFINITIONS.find(
      (item) => item.command === match[1]?.toLowerCase(),
    );
  return command
    ? `${command.instruction}${match?.[2] ? `\n\nUser request:\n${match[2]}` : ""}`
    : text;
}
