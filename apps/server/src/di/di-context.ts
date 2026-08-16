import type { ServicesFromTokens } from "@circulo-ai/di";
import { DI_TOKENS } from "./container";

export type RequestServices = ServicesFromTokens<typeof DI_TOKENS>;
