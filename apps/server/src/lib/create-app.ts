import { bindToHono, type ContainerEnv } from "@circulo-ai/di";
import { Hono } from "hono";
import { DI_TOKENS, buildRootProvider, type RequestContainer } from "@/di/container";
import type { AuthType } from "./auth";
import type { RateLimitDecision } from "@/services/rate-limit";

export type AppEnv = {
  Variables: ContainerEnv<RequestContainer>["Variables"] &
    AuthType & { activeOrgId?: string; rateLimit?: RateLimitDecision };
};

export function createRouter() {
  return new Hono<AppEnv>({
    strict: false,
  });
}

export default function createApp() {
  const app = createRouter();
  const provider = buildRootProvider();

  bindToHono(app, provider, DI_TOKENS, { cache: true, strict: true });

  return app;
}
