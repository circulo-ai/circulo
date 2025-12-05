"use client";

import { useDebounce } from "@/hooks/use-debounce";
import { useLinkStatus } from "next/link";
import { useEffect } from "react";

interface EnhancedLinkProps {
  id: string;
}

export function EnhancedLinkClient({ id }: EnhancedLinkProps) {
  const { pending } = useLinkStatus();
  const { debouncedState: pendingDebounced } = useDebounce(pending, 300);

  useEffect(() => {
    const linkElement = document.getElementById(id);
    if (!linkElement) return;

    if (pendingDebounced) linkElement.setAttribute("data-loading", "");
    else linkElement.removeAttribute("data-loading");
  }, [pendingDebounced]);

  return null;
}
