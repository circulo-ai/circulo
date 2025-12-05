import {
  ServiceCollection,
  type ServiceProvider,
  createToken,
} from "@circulo-ai/di";
import { getDb, type DbInstance } from "@/db";
import { chatRepo, messageRepo } from "@/db/repositories";
import { getRedisClient } from "@/lib/redis";
import type { CirculoRedis } from "@circulo-ai/redis";
import {
  CompositeRateLimitStore,
  DatabaseRateLimitStore,
  RateLimiter,
  RedisRateLimitStore,
} from "@/services/rate-limit";
import { createLogger } from "@/lib/logs/console/logger";
import { DrizzleUnitOfWork } from "./uow";

export const DI_TOKENS = {
  Db: createToken<DbInstance>("Db"),
  Redis: createToken<CirculoRedis | null>("Redis"),
  ChatRepository: createToken<typeof chatRepo>("ChatRepository"),
  MessageRepository: createToken<typeof messageRepo>("MessageRepository"),
  UnitOfWork: createToken<DrizzleUnitOfWork>("UnitOfWork"),
  RateLimiter: createToken<RateLimiter>("RateLimiter"),
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
  services.addSingleton(DI_TOKENS.ChatRepository, chatRepo);
  services.addSingleton(DI_TOKENS.MessageRepository, messageRepo);
  services.addScoped(
    DI_TOKENS.UnitOfWork,
    (resolver) => new DrizzleUnitOfWork(resolver.resolve(DI_TOKENS.Db)),
  );
  services.addSingleton(DI_TOKENS.RateLimiter, (resolver) => {
    const redis = resolver.resolve(DI_TOKENS.Redis);
    const db = resolver.resolve(DI_TOKENS.Db);
    const dbStore = new DatabaseRateLimitStore(db);
    const redisStore = redis ? new RedisRateLimitStore(redis) : null;
    const store = new CompositeRateLimitStore(redisStore, dbStore);

    return new RateLimiter(store, redis);
  });

  rootProvider = services.build();
  return rootProvider;
}
