import { createContainerMiddleware, type ContainerEnv } from "@circulo-ai/di";
import { Hono } from "hono";
import { buildRootProvider, type RequestContainer } from "@/di/container";
import type { AuthType } from "./auth";

export type AppEnv = {
  Variables: ContainerEnv<RequestContainer>["Variables"] &
    AuthType & { activeOrgId?: string };
};

export function createRouter() {
  return new Hono<AppEnv>({
    strict: false,
  });
}

export default function createApp() {
  const app = createRouter();
  const provider = buildRootProvider();

  app.use("*", createContainerMiddleware<RequestContainer, AppEnv>(provider));

  return app;
}
