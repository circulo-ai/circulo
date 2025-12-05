import {
  createContextDiProxy,
  type ServicesFromTokens,
} from "@circulo-ai/di";
import { DI_TOKENS, type RequestContainer } from "./container";

export type RequestServices = ServicesFromTokens<typeof DI_TOKENS>;

export const requestDi = createContextDiProxy<typeof DI_TOKENS, RequestContainer>(
  DI_TOKENS,
);
