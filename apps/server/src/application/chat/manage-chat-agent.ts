import { ChatAgentLink } from "@/domain/chat/chat-agent-link";
import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Guard,
  Identifier,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type LinkAgentInput = {
  id?: string;
  chatId: string;
  agentId: string;
  addedBy: string;
  isEnabled?: boolean;
  customInstructions?: string | null;
  customTemperature?: number | null;
};

export type ToggleAgentLinkInput = {
  id: string;
  isEnabled: boolean;
};

export type UpdateAgentLinkOverridesInput = {
  id: string;
  customInstructions?: string | null;
  customTemperature?: number | null;
};

export type LinkAgentOutput = Result<{ linkId: string }>;
export type ToggleAgentLinkOutput = Result<void>;
export type UpdateAgentLinkOverridesOutput = Result<void>;

export class LinkAgentToChat implements UseCase<
  LinkAgentInput,
  LinkAgentOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: LinkAgentInput): Promise<LinkAgentOutput> {
    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);
    const agentCheck = Guard.isUuid(input.agentId, "agentId");
    if (!agentCheck.succeeded) return Result.fail(agentCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chatAgentLink: links } = createDrizzleRepositories(scope.client);
      const link = new ChatAgentLink({
        id: input.id ? Identifier.from(input.id) : Identifier.create(),
        chatId: Identifier.from(input.chatId),
        agentId: Identifier.from(input.agentId),
        addedBy: input.addedBy,
        isEnabled: input.isEnabled ?? true,
        customInstructions: input.customInstructions ?? null,
        customTemperature: input.customTemperature ?? null,
        createdAt: new Date(),
      });
      await links.save(link);
      return Result.ok({ linkId: link.getId().toString() });
    });
  }
}

export class ToggleAgentLink implements UseCase<
  ToggleAgentLinkInput,
  ToggleAgentLinkOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: ToggleAgentLinkInput): Promise<ToggleAgentLinkOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chatAgentLink: links } = createDrizzleRepositories(scope.client);
      const link = await links.getById(Identifier.from(input.id));
      if (!link) return Result.fail("Chat agent link not found");
      input.isEnabled ? link.enable() : link.disable();
      await links.save(link);
      return Result.ok();
    });
  }
}

export class UpdateAgentLinkOverrides implements UseCase<
  UpdateAgentLinkOverridesInput,
  UpdateAgentLinkOverridesOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(
    input: UpdateAgentLinkOverridesInput,
  ): Promise<UpdateAgentLinkOverridesOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chatAgentLink: links } = createDrizzleRepositories(scope.client);
      const link = await links.getById(Identifier.from(input.id));
      if (!link) return Result.fail("Chat agent link not found");
      link.updateOverrides({
        instructions: input.customInstructions ?? null,
        temperature: input.customTemperature ?? null,
      });
      await links.save(link);
      return Result.ok();
    });
  }
}
