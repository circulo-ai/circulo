import useSWR, { SWRConfiguration, mutate as globalMutate, mutate } from "swr";

export const fetcher = async <T>(
  url: string,
  options?: RequestInit,
): Promise<T> => {
  const res = await fetch(url, options);
  // Handle empty responses (e.g., 204 No Content) safely
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON or empty body — leave json as null
  }

  if (!res.ok) {
    throw new Error((json && json.error) || "An error occurred while fetching data");
  }

  return json as T;
};

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  fetcher,
};

// Prefetch multiple resources
export async function prefetchAll(resources: Array<{ key: any; fetcher: () => Promise<any> }>) {
  await Promise.all(
    resources.map(({ key, fetcher }) =>
      mutate(key, fetcher(), { revalidate: false })
    )
  );
}

export async function clearCachePattern(pattern: RegExp) {
  await mutate(
    key => typeof key === 'string' && pattern.test(key),
    undefined,
    { revalidate: false }
  );
}

// Batch mutations
export async function batchMutate(keys: string[]) {
  await Promise.all(keys.map(key => mutate(key)));
}

// convenient re-exports
export { globalMutate, useSWR };
