import { ServiceCollection, type ServiceProvider } from "@circulo-ai/di";
import { chatRepo, messageRepo } from "@/db/repositories";
import { inngest } from "@/lib/inngest/client";
import { DrizzleUnitOfWork } from "./uow";

export const DI_TOKENS = {
  ChatRepository: Symbol("ChatRepository"),
  MessageRepository: Symbol("MessageRepository"),
  InngestClient: Symbol("InngestClient"),
  UnitOfWork: Symbol("UnitOfWork"),
} as const;

let rootProvider: ServiceProvider | null = null;

export type RequestContainer = ReturnType<ServiceProvider["createScope"]>;

export function buildRootProvider(): ServiceProvider {
  if (rootProvider) return rootProvider;

  const services = new ServiceCollection();

  services.addSingleton(DI_TOKENS.ChatRepository, chatRepo);
  services.addSingleton(DI_TOKENS.MessageRepository, messageRepo);
  services.addSingleton(DI_TOKENS.InngestClient, inngest);
  services.addScoped(DI_TOKENS.UnitOfWork, () => new DrizzleUnitOfWork());

  rootProvider = services.build();
  return rootProvider;
}
