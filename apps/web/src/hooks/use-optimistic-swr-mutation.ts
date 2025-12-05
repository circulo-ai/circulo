import { useCallback } from "react";
import { Arguments, Key, useSWRConfig } from "swr";
import useSWRMutation, {
  MutationFetcher,
  SWRMutationConfiguration,
} from "swr/mutation";

type MatchMutateKey = Arguments | ((key?: Arguments) => boolean);
type TriggerOptions<
  MutationData,
  MutationError,
  MutationKey extends Key,
  MutationArg,
  CacheData,
> = SWRMutationConfiguration<
  MutationData,
  MutationError,
  MutationKey,
  MutationArg,
  CacheData
> & { throwOnError?: boolean };

export type UseOptimisticSWRMutationOptions<
  CacheData,
  OptimisticArg,
  MutationData = unknown,
  MutationError = unknown,
  MutationKey extends Key = Key,
  MutationArg = OptimisticArg,
> = {
  mutationKey: MutationKey;
  mutationFetcher: MutationFetcher<MutationData, MutationKey, MutationArg>;
  matchMutateKey: MatchMutateKey;
  deriveOptimisticData: (
    current: CacheData | undefined,
    optimisticArg: OptimisticArg,
  ) => CacheData | undefined;
  mutationOptions?: SWRMutationConfiguration<
    MutationData,
    MutationError,
    MutationKey,
    MutationArg,
    CacheData
  >;
  mapOptimisticToMutationArg?: (optimisticArg: OptimisticArg) => MutationArg;
  revalidate?: boolean;
  onSuccess?: (data: MutationData, optimisticArg: OptimisticArg) => void;
  onError?: (err: MutationError, optimisticArg: OptimisticArg) => void;
};

export function useOptimisticSWRMutation<
  CacheData,
  OptimisticArg,
  MutationData = unknown,
  MutationError = unknown,
  MutationKey extends Key = Key,
  MutationArg = OptimisticArg,
>({
  mutationKey,
  mutationFetcher,
  matchMutateKey,
  deriveOptimisticData,
  mutationOptions,
  mapOptimisticToMutationArg,
  revalidate = true,
  onSuccess,
  onError,
}: UseOptimisticSWRMutationOptions<
  CacheData,
  OptimisticArg,
  MutationData,
  MutationError,
  MutationKey,
  MutationArg
>) {
  const { mutate } = useSWRConfig();

  const { trigger, isMutating, error, reset } = useSWRMutation<
    MutationData,
    MutationError,
    MutationKey,
    MutationArg,
    CacheData
  >(mutationKey, mutationFetcher, mutationOptions);

  const callTrigger = useCallback(
    (
      arg: MutationArg,
      options?: TriggerOptions<
        MutationData,
        MutationError,
        MutationKey,
        MutationArg,
        CacheData
      >,
    ) =>
      (
        trigger as unknown as (
          arg: MutationArg,
          options?: TriggerOptions<
            MutationData,
            MutationError,
            MutationKey,
            MutationArg,
            CacheData
          >,
        ) => Promise<MutationData>
      )(arg, options),
    [trigger],
  );

  const applyOptimisticUpdate = useCallback(
    (optimisticArg: OptimisticArg) =>
      mutate(
        matchMutateKey,
        (current: CacheData | undefined) =>
          deriveOptimisticData(current, optimisticArg),
        { revalidate: false },
      ),
    [mutate, matchMutateKey, deriveOptimisticData],
  );

  const revalidateCache = useCallback(
    () => (revalidate ? mutate(matchMutateKey) : Promise.resolve()),
    [mutate, matchMutateKey, revalidate],
  );

  const triggerOptimistic = useCallback(
    async (
      optimisticArg: OptimisticArg,
      triggerOptions?: TriggerOptions<
        MutationData,
        MutationError,
        MutationKey,
        MutationArg,
        CacheData
      >,
    ) => {
      await applyOptimisticUpdate(optimisticArg);

      let result: MutationData;
      try {
        const mutationArg = mapOptimisticToMutationArg
          ? mapOptimisticToMutationArg(optimisticArg)
          : (optimisticArg as unknown as MutationArg);

        result = await callTrigger(mutationArg, {
          throwOnError: true,
          revalidate: false,
          ...triggerOptions,
        });
        onSuccess?.(result, optimisticArg);
      } catch (err) {
        onError?.(err as MutationError, optimisticArg);
        await revalidateCache();
        throw err;
      }

      await revalidateCache();
      return result;
    },
    [
      applyOptimisticUpdate,
      mapOptimisticToMutationArg,
      callTrigger,
      onSuccess,
      onError,
      revalidateCache,
    ],
  );

  return {
    trigger: triggerOptimistic,
    isMutating,
    error,
    reset,
  };
}
