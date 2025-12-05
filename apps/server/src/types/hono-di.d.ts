import type { RequestServices } from "@/di/di-context";

declare module "hono" {
  interface Context {
    di: RequestServices;
  }
}
