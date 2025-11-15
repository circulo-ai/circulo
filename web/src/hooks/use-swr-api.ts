import React from "react";
import useSWR, { SWRConfiguration, SWRResponse } from "swr";
import useSWRMutationLib, { SWRMutationConfiguration } from "swr/mutation";

// Generic fetcher type
type ApiFetcher<T, Args extends unknown[]> = (...args: Args) => Promise<T>;

/**
 * SWR hook for GET requests with automatic caching and revalidation
 *
 * @example
 * const { data, error, isLoading, mutate } = useSWRApi(
 *   ['user', userId],
 *   () => userService.getUserById(userId)
 * );
 */
export function useSWRApi<T, Args extends unknown[] = []>(
  key: string | [string, ...Args] | null,
  fetcher: ApiFetcher<T, Args>,
  config?: SWRConfiguration<T>,
): SWRResponse<T> {
  return useSWR<T>(
    key,
    async () => {
      if (!key) return null as T;

      // Extract args from key if it's an array
      const args = Array.isArray(key) ? key.slice(1) : [];
      return fetcher(...(args as Args));
    },
    {
      // Default configs
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      ...config,
    },
  );
}

/**
 * SWR hook for mutations (POST, PUT, DELETE)
 * Optimistic updates and automatic revalidation
 *
 * @example
 * const { trigger, isMutating } = useSWRMutation(
 *   'user',
 *   (key, { arg }) => userService.updateUser(arg.id, arg.data)
 * );
 *
 * await trigger({ id: '123', data: { name: 'John' } });
 */
export function useSWRMutation<T, Args>(
  key: string | [string, ...unknown[]],
  mutationFn: (key: string, options: { arg: Args }) => Promise<T>,
  config?: SWRMutationConfiguration<T, Error, string, Args>,
) {
  return useSWRMutationLib<T, Error, string, Args>(
    Array.isArray(key) ? key[0] : key,
    mutationFn,
    {
      // Automatically revalidate related data after mutation
      revalidate: true,
      ...config,
    },
  );
}

/**
 * Combined hook for GET + mutations on the same resource
 *
 * @example
 * const { data, update, remove, isLoading } = useSWRResource(
 *   ['user', userId],
 *   () => userService.getUserById(userId),
 *   {
 *     update: (data) => userService.updateUser(userId, data),
 *     delete: () => userService.deleteUser(userId),
 *   }
 * );
 */
export function useSWRResource<T, UpdateArgs = Partial<T>>(
  key: string | [string, ...unknown[]] | null,
  fetcher: () => Promise<T>,
  mutations?: {
    update?: (data: UpdateArgs) => Promise<T>;
    delete?: () => Promise<void>;
  },
  config?: SWRConfiguration<T>,
) {
  const keyString = Array.isArray(key) ? key[0] : key || "";

  // GET request - using flexible type
  const { data, error, isLoading, mutate, isValidating } = useSWRApi<T>(
    key as any, // Type assertion to handle flexible key format
    fetcher,
    config,
  );

  // UPDATE mutation
  const { trigger: updateTrigger, isMutating: isUpdating } = useSWRMutationLib<
    T,
    Error,
    string,
    UpdateArgs
  >(
    keyString,
    async (key: string, { arg }: { arg: UpdateArgs }) => {
      if (!mutations?.update) {
        throw new Error("Update mutation not provided");
      }
      return mutations.update(arg);
    },
    {
      revalidate: true,
      onSuccess: (newData) => {
        // Optimistically update the cache
        mutate(newData, false);
      },
    },
  );

  // DELETE mutation
  const { trigger: deleteTrigger, isMutating: isDeleting } = useSWRMutationLib<
    void,
    Error,
    string,
    void
  >(
    keyString,
    async () => {
      if (!mutations?.delete) {
        throw new Error("Delete mutation not provided");
      }
      return mutations.delete();
    },
    {
      revalidate: true,
      onSuccess: () => {
        // Invalidate the cache
        mutate(undefined, false);
      },
    },
  );

  return {
    data,
    error,
    isLoading,
    isValidating,
    isUpdating,
    isDeleting,
    mutate,
    update: mutations?.update ? updateTrigger : undefined,
    remove: mutations?.delete ? deleteTrigger : undefined,
  };
}

/**
 * Hook for paginated data with SWR
 *
 * @example
 * const { data, setPage, page, isLoading } = useSWRPagination(
 *   'users',
 *   (page, pageSize) => userService.getUsers(page, pageSize),
 *   { pageSize: 20 }
 * );
 */
export function useSWRPagination<T>(
  baseKey: string,
  fetcher: (
    page: number,
    pageSize: number,
  ) => Promise<{
    data: T[];
    total: number;
    page: number;
    pageSize: number;
  }>,
  options?: {
    initialPage?: number;
    pageSize?: number;
    config?: SWRConfiguration;
  },
) {
  const { initialPage = 1, pageSize = 20, config } = options || {};
  const [page, setPage] = React.useState(initialPage);

  const { data, error, isLoading, mutate } = useSWRApi<{
    data: T[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    [baseKey, page, pageSize] as any, // Type assertion for flexible key
    () => fetcher(page, pageSize),
    config,
  );

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return {
    data: data?.data,
    total: data?.total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    setPage,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPage((p) => Math.max(p - 1, 1)),
    mutate,
  };
}
