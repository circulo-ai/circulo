import {
  ServiceCollection,
  type ServiceProvider,
  type Token,
} from "@circulo-ai/di";
import { getDb, type DbInstance } from "@/db";
import { chatRepo, messageRepo } from "@/db/repositories";
import { getRedisClient } from "@/lib/redis";
import type { CirculoRedis } from "@circulo-ai/redis";
import { DrizzleUnitOfWork } from "./uow";

export const DI_TOKENS = {
  Db: Symbol("Db") as Token<DbInstance>,
  Redis: Symbol("Redis") as Token<CirculoRedis | null>,
  ChatRepository: Symbol("ChatRepository") as Token<typeof chatRepo>,
  MessageRepository: Symbol("MessageRepository") as Token<typeof messageRepo>,
  UnitOfWork: Symbol("UnitOfWork") as Token<DrizzleUnitOfWork>,
} as const;

let rootProvider: ServiceProvider | null = null;

export type RequestContainer = ReturnType<ServiceProvider["createScope"]>;

export function buildRootProvider(): ServiceProvider {
  if (rootProvider) return rootProvider;

  const services = new ServiceCollection();

  services.addSingleton(DI_TOKENS.Db, () => getDb());
  services.addSingleton(DI_TOKENS.Redis, () => getRedisClient());
  services.addSingleton(DI_TOKENS.ChatRepository, chatRepo);
  services.addSingleton(DI_TOKENS.MessageRepository, messageRepo);
  services.addScoped(
    DI_TOKENS.UnitOfWork,
    (resolver) => new DrizzleUnitOfWork(resolver.resolve(DI_TOKENS.Db)),
  );

  rootProvider = services.build();
  return rootProvider;
}
