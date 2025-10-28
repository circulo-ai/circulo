import useSWR, { SWRConfiguration, mutate as globalMutate } from "swr";

export const fetcher = async <T>(
  url: string,
  options?: RequestInit,
): Promise<T> => {
  const res = await fetch(url, options);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || "An error occurred while fetching data");
  }

  return json.data ?? json;
};

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  fetcher,
};

// convenient re-exports
export { globalMutate, useSWR };
