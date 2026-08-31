import type { AiProviderId } from "@circulo-ai/types";

export function defaultModelForProvider(providerId: AiProviderId | string) {
  switch (providerId) {
    case "openai":
    case "openai-compatible":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "google":
      return "gemini-2.5-flash";
    default:
      return "openrouter/free";
  }
}
