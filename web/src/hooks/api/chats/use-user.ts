import { useDebouncedLoading } from "@/hooks/use-debounced-loading";
import { useSession } from "@/providers/session-provider";

export function useUser() {
  const { data, isPending: immediateIsLoading } = useSession();

  const isLoading = useDebouncedLoading(immediateIsLoading, 300);

  return { isLoading, user: data?.user };
}
