"use server";

import type { VisibilityType } from "@/components/visibility-selector";
import { chatRepo, messageRepo } from "@/db/repositories";
import { titlePrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { getTextFromMessage } from "@/lib/utils";
import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel("title-model"),
    system: titlePrompt,
    prompt: getTextFromMessage(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const message = await messageRepo.findById(id);

  if (!message) {
    return;
  }

  await messageRepo.deleteByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await chatRepo.updateVisibilityById({ chatId, visibility });
}
