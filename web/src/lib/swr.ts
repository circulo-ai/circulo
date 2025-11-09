import useSWR, { SWRConfiguration, mutate as globalMutate } from "swr";

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

// convenient re-exports
export { globalMutate, useSWR };
