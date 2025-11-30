import { Agent, ChatAgentWithAgent } from "@/db";
import { myProvider } from "@/lib/ai/providers";
import { streamText } from "ai";

export function createAgentFromDefinition(agent: Agent) {
  const provider = myProvider.languageModel(agent.model);

  return {
    streamText: (
      config: Parameters<typeof streamText>[0],
    ): ReturnType<typeof streamText> => {
      return streamText({
        ...config,
        model: config.model ?? provider,
        system: config.system ?? agent.instructions,
        temperature:
          config.temperature ??
          (agent.temperature ? agent.temperature / 100 : 0.7),
      });
    },
  };
}

export function createAgentFromChatAgent(chatAgent: ChatAgentWithAgent) {
  return createAgentFromDefinition({
    ...chatAgent.agent,
    instructions: chatAgent.customInstructions ?? chatAgent.agent.instructions,
    temperature: chatAgent.customTemperature ?? chatAgent.agent.temperature,
  });
}
