import {
  AcceptChatInvitation,
  AddChatMember,
  ChangeChatVisibility,
  CreateArtifact,
  CreateChat,
  CreateChatWithMessage,
  CreateSuggestion,
  DeleteChat,
  InviteToChat,
  LinkAgentToChat,
  PostMessage,
  RemoveChatMember,
  RenameChat,
  ResolveSuggestion,
  SetVote,
  ToggleAgentLink,
  UpdateAgentLinkOverrides,
  UpdateArtifact,
  UpdateChatMemberPermissions,
} from "@/application";
import { getDb, type DbInstance } from "@/db";
import type { DrizzleRepositories } from "@/infrastructure/drizzle";
import {
  createDrizzleRepositories,
  type DrizzleAgentRepository,
  type DrizzleArtifactRepository,
  type DrizzleChatAgentLinkRepository,
  type DrizzleChatInvitationRepository,
  type DrizzleChatMemberRepository,
  type DrizzleChatRepository,
  type DrizzleMessageRepository,
  type DrizzleOrganizationMemberRepository,
  type DrizzleOrganizationRepository,
  type DrizzleSuggestionRepository,
  type DrizzleUserRepository,
  type DrizzleWorkflowRunRepository,
} from "@/infrastructure/drizzle";
import { createLogger } from "@/lib/logs/console/logger";
import { getRedisClient } from "@/lib/redis";
import {
  CompositeRateLimitStore,
  DatabaseRateLimitStore,
  RateLimiter,
  RedisRateLimitStore,
} from "@/services/rate-limit";
import { DomainEventPublisher } from "@circulo-ai/core";
import {
  createToken,
  ServiceCollection,
  type ServiceProvider,
} from "@circulo-ai/di";
import type { CirculoRedis } from "@circulo-ai/redis";
import { DrizzleUnitOfWork } from "./uow";

export const DI_TOKENS = {
  Db: createToken<DbInstance>("Db"),
  Redis: createToken<CirculoRedis | null>("Redis"),
  DrizzleRepositories: createToken<DrizzleRepositories>("DrizzleRepositories"),
  ChatRepository: createToken<DrizzleChatRepository>("ChatRepository"),
  MessageRepository: createToken<DrizzleMessageRepository>("MessageRepository"),
  AgentRepository: createToken<DrizzleAgentRepository>("AgentRepository"),
  ChatMemberRepository: createToken<DrizzleChatMemberRepository>(
    "ChatMemberRepository",
  ),
  ChatInvitationRepository: createToken<DrizzleChatInvitationRepository>(
    "ChatInvitationRepository",
  ),
  ChatAgentLinkRepository: createToken<DrizzleChatAgentLinkRepository>(
    "ChatAgentLinkRepository",
  ),
  ArtifactRepository:
    createToken<DrizzleArtifactRepository>("ArtifactRepository"),
  SuggestionRepository: createToken<DrizzleSuggestionRepository>(
    "SuggestionRepository",
  ),
  UserRepository: createToken<DrizzleUserRepository>("UserRepository"),
  OrganizationRepository: createToken<DrizzleOrganizationRepository>(
    "OrganizationRepository",
  ),
  OrganizationMemberRepository:
    createToken<DrizzleOrganizationMemberRepository>(
      "OrganizationMemberRepository",
    ),
  VoteRepository:
    createToken<import("@/infrastructure/drizzle").DrizzleVoteRepository>(
      "VoteRepository",
    ),
  UnitOfWork: createToken<DrizzleUnitOfWork>("UnitOfWork"),
  WorkflowRunRepository: createToken<DrizzleWorkflowRunRepository>(
    "WorkflowRunRepository",
  ),
  RateLimiter: createToken<RateLimiter>("RateLimiter"),
  DomainEventPublisher: createToken<DomainEventPublisher>(
    "DomainEventPublisher",
  ),
  CreateChatUseCase: createToken<CreateChat>("CreateChatUseCase"),
  CreateChatWithMessageUseCase: createToken<CreateChatWithMessage>(
    "CreateChatWithMessageUseCase",
  ),
  RenameChatUseCase: createToken<RenameChat>("RenameChatUseCase"),
  PostMessageUseCase: createToken<PostMessage>("PostMessageUseCase"),
  ChangeChatVisibilityUseCase: createToken<ChangeChatVisibility>(
    "ChangeChatVisibilityUseCase",
  ),
  DeleteChatUseCase: createToken<DeleteChat>("DeleteChatUseCase"),
  InviteToChatUseCase: createToken<InviteToChat>("InviteToChatUseCase"),
  AcceptChatInvitationUseCase: createToken<AcceptChatInvitation>(
    "AcceptChatInvitationUseCase",
  ),
  AddChatMemberUseCase: createToken<AddChatMember>("AddChatMemberUseCase"),
  RemoveChatMemberUseCase: createToken<RemoveChatMember>(
    "RemoveChatMemberUseCase",
  ),
  UpdateChatMemberPermissionsUseCase: createToken<UpdateChatMemberPermissions>(
    "UpdateChatMemberPermissionsUseCase",
  ),
  LinkAgentToChatUseCase: createToken<LinkAgentToChat>(
    "LinkAgentToChatUseCase",
  ),
  ToggleAgentLinkUseCase: createToken<ToggleAgentLink>(
    "ToggleAgentLinkUseCase",
  ),
  UpdateAgentLinkOverridesUseCase: createToken<UpdateAgentLinkOverrides>(
    "UpdateAgentLinkOverridesUseCase",
  ),
  CreateArtifactUseCase: createToken<CreateArtifact>("CreateArtifactUseCase"),
  UpdateArtifactUseCase: createToken<UpdateArtifact>("UpdateArtifactUseCase"),
  CreateSuggestionUseCase: createToken<CreateSuggestion>(
    "CreateSuggestionUseCase",
  ),
  ResolveSuggestionUseCase: createToken<ResolveSuggestion>(
    "ResolveSuggestionUseCase",
  ),
  SetVoteUseCase: createToken<SetVote>("SetVoteUseCase"),
} as const;

let rootProvider: ServiceProvider | null = null;

export type RequestContainer = ReturnType<ServiceProvider["createScope"]>;

export function buildRootProvider(): ServiceProvider {
  if (rootProvider) return rootProvider;

  const logger = createLogger("DI");
  const services = new ServiceCollection({
    allowOverwrite: false,
    trace: (event) => {
      logger.debug("resolve", {
        token: String(event.token),
        key: event.key,
        lifetime: event.lifetime,
        path: event.path,
        async: event.async,
      });
    },
  });

  services.addGlobalSingleton(DI_TOKENS.Db, () => getDb(), {
    disposePriority: 20,
  });
  services.addGlobalSingleton(DI_TOKENS.Redis, () => getRedisClient(), {
    disposePriority: 10,
  });
  services.addSingleton(
    DI_TOKENS.DomainEventPublisher,
    () => new DomainEventPublisher(),
  );

  services.addScoped(
    DI_TOKENS.UnitOfWork,
    (resolver) => new DrizzleUnitOfWork(resolver.resolve(DI_TOKENS.Db)),
  );

  services.addScoped(DI_TOKENS.DrizzleRepositories, (resolver) =>
    createDrizzleRepositories(resolver.resolve(DI_TOKENS.UnitOfWork).client),
  );
  services.addScoped(
    DI_TOKENS.ChatRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).chat,
  );
  services.addScoped(
    DI_TOKENS.MessageRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).message,
  );
  services.addScoped(
    DI_TOKENS.AgentRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).agent,
  );
  services.addScoped(
    DI_TOKENS.ChatMemberRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).chatMember,
  );
  services.addScoped(
    DI_TOKENS.ChatInvitationRepository,
    (resolver) =>
      resolver.resolve(DI_TOKENS.DrizzleRepositories).chatInvitation,
  );
  services.addScoped(
    DI_TOKENS.ChatAgentLinkRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).chatAgentLink,
  );
  services.addScoped(
    DI_TOKENS.ArtifactRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).artifact,
  );
  services.addScoped(
    DI_TOKENS.SuggestionRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).suggestion,
  );
  services.addScoped(
    DI_TOKENS.UserRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).user,
  );
  services.addScoped(
    DI_TOKENS.OrganizationRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).organization,
  );
  services.addScoped(
    DI_TOKENS.OrganizationMemberRepository,
    (resolver) =>
      resolver.resolve(DI_TOKENS.DrizzleRepositories).organizationMember,
  );
  services.addScoped(
    DI_TOKENS.VoteRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).vote,
  );
  services.addScoped(
    DI_TOKENS.WorkflowRunRepository,
    (resolver) => resolver.resolve(DI_TOKENS.DrizzleRepositories).workflowRun,
  );

  services.addScoped(DI_TOKENS.CreateChatUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    const publisher = resolver.resolve(DI_TOKENS.DomainEventPublisher);
    return new CreateChat(uow, publisher);
  });

  services.addScoped(DI_TOKENS.CreateChatWithMessageUseCase, (resolver) => {
    return new CreateChatWithMessage(
      resolver.resolve(DI_TOKENS.UnitOfWork),
      resolver.resolve(DI_TOKENS.DomainEventPublisher),
    );
  });

  services.addScoped(DI_TOKENS.RenameChatUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    const publisher = resolver.resolve(DI_TOKENS.DomainEventPublisher);
    return new RenameChat(uow, publisher);
  });

  services.addScoped(DI_TOKENS.ChangeChatVisibilityUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    const publisher = resolver.resolve(DI_TOKENS.DomainEventPublisher);
    return new ChangeChatVisibility(uow, publisher);
  });

  services.addScoped(DI_TOKENS.DeleteChatUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new DeleteChat(uow);
  });

  services.addScoped(DI_TOKENS.InviteToChatUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new InviteToChat(uow);
  });

  services.addScoped(DI_TOKENS.AcceptChatInvitationUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new AcceptChatInvitation(uow);
  });

  services.addScoped(DI_TOKENS.AddChatMemberUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new AddChatMember(uow);
  });

  services.addScoped(DI_TOKENS.RemoveChatMemberUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new RemoveChatMember(uow);
  });

  services.addScoped(
    DI_TOKENS.UpdateChatMemberPermissionsUseCase,
    (resolver) => {
      const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
      return new UpdateChatMemberPermissions(uow);
    },
  );

  services.addScoped(DI_TOKENS.LinkAgentToChatUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new LinkAgentToChat(uow);
  });

  services.addScoped(DI_TOKENS.ToggleAgentLinkUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new ToggleAgentLink(uow);
  });

  services.addScoped(DI_TOKENS.UpdateAgentLinkOverridesUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new UpdateAgentLinkOverrides(uow);
  });

  services.addScoped(DI_TOKENS.PostMessageUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new PostMessage(uow);
  });

  services.addScoped(DI_TOKENS.CreateArtifactUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new CreateArtifact(uow);
  });

  services.addScoped(DI_TOKENS.UpdateArtifactUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new UpdateArtifact(uow);
  });

  services.addScoped(DI_TOKENS.CreateSuggestionUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new CreateSuggestion(uow);
  });

  services.addScoped(DI_TOKENS.ResolveSuggestionUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new ResolveSuggestion(uow);
  });

  services.addScoped(DI_TOKENS.SetVoteUseCase, (resolver) => {
    const uow = resolver.resolve(DI_TOKENS.UnitOfWork);
    return new SetVote(uow);
  });

  services.addSingleton(
    DI_TOKENS.RateLimiter,
    (resolver) => {
      const redis = resolver.resolve(DI_TOKENS.Redis);
      const db = resolver.resolve(DI_TOKENS.Db);
      const dbStore = new DatabaseRateLimitStore(db);
      const redisStore = redis ? new RedisRateLimitStore(redis) : null;
      const store = new CompositeRateLimitStore(redisStore, dbStore);

      return new RateLimiter(store, redis);
    },
    {
      dependencies: [DI_TOKENS.Redis, DI_TOKENS.Db],
    },
  );

  rootProvider = services.buildServiceProvider({ validateOnBuild: true });
  return rootProvider;
}
