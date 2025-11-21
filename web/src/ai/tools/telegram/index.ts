import { defineTool } from "@/ai/tools";
import { tool } from "ai";
import { z } from "zod";

// ==================== HELPERS ====================

function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/__(.*?)__/g, "<b>$1</b>")
    .replace(/\*(.*?)\*/g, "<i>$1</i>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

async function callTelegramApi<T = unknown>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error: ${method}`);
  }
  return data.result as T;
}

// ==================== SEND MESSAGE ====================

const sendMessageParamsSchema = z.object({
  chatId: z
    .string()
    .optional()
    .describe(
      "Telegram chat ID. If not provided, uses the configured default.",
    ),
  text: z.string().describe("Message text to send (supports markdown)"),
  parseMode: z
    .enum(["HTML", "Markdown", "MarkdownV2"])
    .optional()
    .describe("How to parse the message text"),
  disableNotification: z
    .boolean()
    .optional()
    .describe("Send silently without notification"),
});

const sendMessageConfigSchema = z
  .object({
    defaultChatId: z.string().optional(),
    parseMode: z
      .enum(["HTML", "Markdown", "MarkdownV2"])
      .optional()
      .default("HTML"),
  })
  .optional();

export const telegramSendMessage = defineTool({
  id: "telegram.sendMessage",
  name: "Send Telegram Message",
  description: "Send a message to a Telegram chat or channel via Bot API",
  category: "telegram",

  parametersSchema: sendMessageParamsSchema,
  configSchema: sendMessageConfigSchema,
  requiredEnvVars: ["TELEGRAM_BOT_TOKEN"],
  optionalEnvVars: ["TELEGRAM_DEFAULT_CHAT_ID"],
  summarizeInstance: (env, config) => {
    const out: string[] = [];
    const cfg = config || {};
    const parseMode = (cfg as any).parseMode as string | undefined;
    if (parseMode) out.push(`parseMode=${parseMode}`);
    const hasDefaultChat = Boolean(
      (cfg as any)?.defaultChatId || env.TELEGRAM_DEFAULT_CHAT_ID,
    );
    out.push(`defaultChatConfigured=${hasDefaultChat}`);
    return out;
  },

  createRuntime: (ctx) => {
    const botToken = ctx.env.TELEGRAM_BOT_TOKEN!;
    const config = ctx.config;
    const defaultChatId =
      config?.defaultChatId || ctx.env.TELEGRAM_DEFAULT_CHAT_ID;
    const alias = (config as any)?.alias as string | undefined;
    const desc = alias
      ? `Send a message to a Telegram chat or channel via Bot API (bot: ${alias})`
      : "Send a message to a Telegram chat or channel via Bot API";

    return tool({
      description: desc,

      // 1. Use 'parameters' only. This is the standard property for the 'tool' helper.
      inputSchema: sendMessageParamsSchema,

      // 2. REMOVED: inputSchema (conflicts with parameters)
      // 3. REMOVED: outputSchema (inferred automatically from execute return type)

      execute: async ({ chatId, text, parseMode, disableNotification }) => {
        const targetChatId = chatId || defaultChatId;
        if (!targetChatId) {
          return { success: false, error: "No chat ID provided or configured" };
        }

        try {
          const processedText =
            (parseMode || config?.parseMode) === "HTML"
              ? markdownToHtml(text)
              : text;

          await callTelegramApi(botToken, "sendMessage", {
            chat_id: targetChatId,
            text: processedText,
            parse_mode: parseMode || config?.parseMode || "HTML",
            disable_notification: disableNotification,
          });

          return { success: true, chatId: targetChatId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          return { success: false, error: msg };
        }
      },
    });
  },
});
