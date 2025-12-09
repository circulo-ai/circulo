import { artifactRepo } from "@/db/repositories";
import { chatRepo } from "@/db/repositories/chat-repo";
import { createRouter } from "@/lib/create-app";
import { isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const querySchema = z.object({
  id: z.uuid(),
});

const bodySchema = z.object({
  title: z.string(),
  content: z.string(),
  chatId: z.uuid().optional(),
  kind: z.enum(["text", "image", "code", "sheet"]),
});

const router = createRouter();

router.get(
  "/artifact",
  requireAuth,
  zValidator("query", querySchema),
  async (c) => {
    const { id } = c.req.valid("query");

    const document = await artifactRepo.findByIdWithSuggestions(id);

    if (!document) {
      throw new NotFoundError();
    }

    if (document.userId === c.var.user!.id) {
      return c.json([document], 200);
    }

    if (!document.chatId) {
      throw new ForbiddenError("You don't have access to this artifact!");
    }

    const chat = await chatRepo.findById(document.chatId);

    if (!chat || !chat.organizationId) {
      throw new ForbiddenError("No access!");
    }

    const isOrgMember = await isMemberOf(c.var.user!.id, chat.organizationId);

    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this artifact!");
    }

    return c.json([document], 200);
  },
);

router.post(
  "/artifact",
  requireAuth,
  zValidator("query", querySchema),
  zValidator("json", bodySchema),
  async (c) => {
    const { id } = c.req.valid("query");
    const { content, title, kind, chatId } = c.req.valid("json");
    const user = c.var.user!;

    const existingDoc = await artifactRepo.findById(id);

    if (existingDoc) {
      if (existingDoc.userId !== user.id) {
        if (!existingDoc.chatId) {
          throw new ForbiddenError();
        }

        const chat = await chatRepo.findById(existingDoc.chatId);

        if (!chat || !chat.organizationId) {
          throw new ForbiddenError();
        }

        const isOrgMember = await isMemberOf(user.id, chat.organizationId);

        if (!isOrgMember) {
          throw new ForbiddenError();
        }
      }

      const updatedDoc = await artifactRepo.update(id, {
        content,
        title,
        kind,
      });

      return c.json(updatedDoc, 200);
    }

    const newDoc = await artifactRepo.create({
      id,
      content,
      title,
      kind,
      userId: user.id,
      chatId: chatId ?? null,
      version: 1,
    });

    return c.json(newDoc, 200);
  },
);

router.delete(
  "/artifact",
  requireAuth,
  zValidator("query", querySchema),
  async (c) => {
    const { id } = c.req.valid("query");
    const user = c.var.user!;

    if (!id) {
      throw new BadRequestError();
    }

    const document = await artifactRepo.findById(id);

    if (!document) {
      throw new NotFoundError();
    }

    if (document.userId !== user.id) {
      throw new ForbiddenError();
    }

    const deletedDoc = await artifactRepo.delete(id);

    return c.json(deletedDoc, 200);
  },
);

export default router;
