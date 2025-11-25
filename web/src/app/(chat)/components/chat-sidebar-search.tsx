"use client";

import { CustomInputGroup } from "@/components/ui-custom/input-group";
import { InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useSidebar } from "@/components/ui/sidebar";
import { Search } from "lucide-react";
import { useEffect } from "react";

interface ChatSidebarSearchProps {
  search: string;
  setSearch: (search: string) => void;
}

export function ChatSidebarSearch({
  search,
  setSearch,
}: ChatSidebarSearchProps) {
  const { open } = useSidebar();

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <CustomInputGroup className="min-w-47">
      <InputGroupInput
        disabled={open ? undefined : true}
        placeholder=" Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </CustomInputGroup>
  );
}

// TODO save search state when sidebar collapses and use it when it extends
