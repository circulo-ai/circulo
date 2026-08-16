import {
  DI_TOKENS,
  buildRootProvider,
  type RequestContainer,
} from "@/di/container";
import type { RateLimitDecision } from "@/services/rate-limit";
import { bindToHono, type ContainerEnv } from "@circulo-ai/di";
import { Hono } from "hono";
import type { AuthType } from "./auth";

export type AppEnv = {
  Variables: ContainerEnv<RequestContainer>["Variables"] &
    AuthType & { activeOrgId?: string; rateLimit?: RateLimitDecision };
};

export function createRouter() {
  return new Hono<AppEnv>({
    strict: true,
  });
}

export default function createApp() {
  const app = createRouter();
  const provider = buildRootProvider();

  const bind = bindToHono as unknown as (
    app: unknown,
    provider: unknown,
    tokens: unknown,
    options: unknown,
  ) => void;
  bind(app, provider, DI_TOKENS, { cache: true, strict: true });

  return app;
}
