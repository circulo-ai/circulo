import {
  buildRootProvider,
  DI_TOKENS,
  type RequestContainer,
} from "@/di/container";
import { type ServicesFromTokens, withScope } from "@circulo-ai/di";

type RequestServices = ServicesFromTokens<typeof DI_TOKENS>;

const provider = buildRootProvider();

/**
 * Execute a function with a fresh DI scope, resolving services lazily.
 * Scope is disposed automatically after the function completes.
 */
export async function withRequestServices<TResult>(
  work: (di: RequestServices, scope: RequestContainer) => Promise<TResult>,
): Promise<TResult> {
  return withScope<RequestContainer, TResult>(provider, async (scope) => {
    // Lazily resolve services so transients behave correctly within the scope
    const di = new Proxy({} as RequestServices, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        if (!Object.prototype.hasOwnProperty.call(DI_TOKENS, prop)) return undefined;
        const key = prop as keyof typeof DI_TOKENS;
        const token = DI_TOKENS[key] as Parameters<
          RequestContainer["resolve"]
        >[0];
        return scope.resolve(token) as RequestServices[typeof key];
      },
    });

    return work(di, scope);
  });
}
