import { COMPOSER_COMMAND_DEFINITIONS } from "@circulo-ai/types";
import { BookText, GitCompare, Lightbulb, ListChecks } from "lucide-react";
const icons = {
  summarize: BookText,
  explain: Lightbulb,
  plan: ListChecks,
  compare: GitCompare,
};
export const COMPOSER_COMMANDS = COMPOSER_COMMAND_DEFINITIONS.map((command) => {
  const Icon = icons[command.command];
  return {
    ...command,
    type: "command" as const,
    icon: <Icon aria-hidden="true" />,
  };
});
