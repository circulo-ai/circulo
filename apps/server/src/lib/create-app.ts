import { bindToHono, type ContainerEnv } from "@circulo-ai/di";
import {
  DI_TOKENS,
  buildRootProvider,
  type RequestContainer,
} from "@/di/container";
import type { AuthType } from "./auth";
import type { RateLimitDecision } from "@/services/rate-limit";
import { Hono } from "hono";

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

  bindToHono(app, provider, DI_TOKENS, { cache: true, strict: true });

  return app;
}
