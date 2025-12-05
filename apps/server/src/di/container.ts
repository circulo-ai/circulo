import {
  ServiceCollection,
  type ServiceProvider,
  type Token,
} from "@circulo-ai/di";
import { chatRepo, messageRepo } from "@/db/repositories";
import { DrizzleUnitOfWork } from "./uow";

export const DI_TOKENS = {
  ChatRepository: Symbol("ChatRepository") as Token<typeof chatRepo>,
  MessageRepository: Symbol("MessageRepository") as Token<typeof messageRepo>,
  UnitOfWork: Symbol("UnitOfWork") as Token<DrizzleUnitOfWork>,
} as const;

let rootProvider: ServiceProvider | null = null;

export type RequestContainer = ReturnType<ServiceProvider["createScope"]>;

export function buildRootProvider(): ServiceProvider {
  if (rootProvider) return rootProvider;

  const services = new ServiceCollection();

  services.addSingleton(DI_TOKENS.ChatRepository, chatRepo);
  services.addSingleton(DI_TOKENS.MessageRepository, messageRepo);
  services.addScoped(DI_TOKENS.UnitOfWork, () => new DrizzleUnitOfWork());

  rootProvider = services.build();
  return rootProvider;
}
