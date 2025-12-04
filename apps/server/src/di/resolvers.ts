import { resolveFromContext } from "@circulo-ai/di";
import type { Context } from "hono";
import { DI_TOKENS, type RequestContainer } from "./container";
import { chatRepo, messageRepo } from "@/db/repositories";
import { DrizzleUnitOfWork } from "./uow";
import type { AppEnv } from "@/lib/create-app";

export function getMessageRepository(c: Context<AppEnv>) {
  return resolveFromContext<typeof messageRepo, RequestContainer, AppEnv>(
    c,
    DI_TOKENS.MessageRepository,
  );
}

export function getChatRepository(c: Context<AppEnv>) {
  return resolveFromContext<typeof chatRepo, RequestContainer, AppEnv>(
    c,
    DI_TOKENS.ChatRepository,
  );
}

export function getUnitOfWork(c: Context<AppEnv>) {
  return resolveFromContext<DrizzleUnitOfWork, RequestContainer, AppEnv>(
    c,
    DI_TOKENS.UnitOfWork,
  );
}
