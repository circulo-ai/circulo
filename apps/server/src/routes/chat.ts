import { titlePrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { type ChatMessage } from "@/lib/types";
import { getTextFromMessage, getTextFromMessages } from "@/lib/utils";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  RateLimitError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { generateText, safeValidateUIMessages } from "ai";
import { z } from "zod";

const deleteQuerySchema = z.object({
  id: z.uuid(),
});

const createChatSchema = z.object({
  id: z.uuid(),
  visibility: z.enum(["private", "public"]).default("private"),
  message: z.unknown().refine(async (value) => {
    const { success } = await safeValidateUIMessages<ChatMessage>({
      messages: [value],
    });
    return success;
  }),
});

const router = createRouter();

async function generateTitleFromUserMessages({
  messages,
}: {
  messages: ChatMessage[];
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel("title-model"),
    system: titlePrompt,
    prompt: getTextFromMessages(messages),
  });

  return title;
}

router.post(
  "/chat",
  requireAuth,
  zValidator("json", createChatSchema),
  async (c) => {
    try {
      const {
        id,
        message,
        visibility: selectedVisibilityType,
      } = c.req.valid("json");
      const { user, session } = c.var;
      const di = c.di;
      const activeOrgId = c.get("activeOrgId");

      const messages: ChatMessage[] = [message as ChatMessage];

      const activeOrganizationId =
        activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

      const isOrgMember = await isMemberOf(user!.id, activeOrganizationId);
      if (!isOrgMember) {
        throw new ForbiddenError("You are not a member of this organization");
      }

      const canCreate = await hasPermission(
        "chat",
        "create",
        activeOrganizationId,
        session as any,
      );
      if (!canCreate) {
        throw new ForbiddenError(
          "You don't have permission to create chats in this organization",
        );
      }

      const title = await generateTitleFromUserMessages({ messages });

      const createChat = di.CreateChatUseCase;
      const postMessage = di.PostMessageUseCase;

      const chatResult = await createChat.execute({
        id,
        organizationId: activeOrganizationId,
        creatorId: user!.id,
        title,
        visibility: selectedVisibilityType,
      });
      if (chatResult.isFailure) {
        throw new BadRequestError(
          chatResult.getError() ?? "Unable to create chat",
        );
      }

      for (const msg of messages) {
        const messageResult = await postMessage.execute({
          id: msg.id,
          chatId: id,
          authorId: user!.id,
          content: getTextFromMessage(msg),
        });
        if (messageResult.isFailure) {
          throw new BadRequestError(
            messageResult.getError() ?? "Unable to post message",
          );
        }
      }

      // TODO
      // const orchestrationInput: OrchestrationInput = {
      //   chatId: id,
      //   messages: messages,
      //   triggerType: "user_message",
      //   session: session as any,
      // };

      // const eventId = randomUUID();
      // await inngest.send({
      //   name: "app/orchestrate.run",
      //   data: orchestrationInput,
      //   id: eventId,
      // });

      return c.json({ success: true, eventId: 12 }, 202);
    } catch (error) {
      if (error instanceof RateLimitError) return error.toResponse();
      if (
        error instanceof Error &&
        error.message?.includes("AI Gateway requires a valid credit card")
      ) {
        return new BadRequestError(
          "AI Gateway requires a valid credit card",
        ).toResponse();
      }
      if (error instanceof HttpError) {
        throw error;
      }

      console.error("[Chat Error]", error);
      return c.json({ message: "Internal server error" }, 500);
    }
  },
);

router.delete(
  "/chat",
  requireAuth,
  zValidator("query", deleteQuerySchema),
  async (c) => {
    const { id } = c.req.valid("query");
    const di = c.di;
    const activeOrgId = c.get("activeOrgId");

    const activeOrganizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    if (!activeOrganizationId) {
      throw new ForbiddenError("No active organization");
    }

    const result = await di.DeleteChatUseCase.execute({ id });
    if (result.isFailure) {
      return new BadRequestError(
        result.getError() ?? "Unable to delete chat",
      ).toResponse();
    }
    return c.json({ success: true }, 200);
  },
);

export default router;
