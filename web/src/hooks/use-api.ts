import { useState, useCallback, useEffect } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseApiReturn<T, Args extends unknown[]> extends UseApiState<T> {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
}

/**
 * Custom hook for API calls with loading and error states
 *
 * @example
 * const { data, loading, error, execute } = useApi(userService.getUserById);
 *
 * // Call it
 * await execute('user-123');
 */
export function useApi<T, Args extends unknown[]>(
  apiFunc: (...args: Args) => Promise<T>
): UseApiReturn<T, Args> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState({ data: null, loading: true, error: null });

      try {
        const result = await apiFunc(...args);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setState({ data: null, loading: false, error });
        return null;
      }
    },
    [apiFunc]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for API calls that should run on mount
 *
 * @example
 * const { data, loading, error, refetch } = useApiOnMount(
 *   () => userService.getUserById('123')
 * );
 */

export function useApiOnMount<T>(apiFunc: () => Promise<T>) {
  const { data, loading, error, execute } = useApi(apiFunc);

  useEffect(() => {
    execute();
  }, []); // run only once on mount

  const refetch = useCallback(() => execute(), [execute]);

  return { data, loading, error, refetch };
}
