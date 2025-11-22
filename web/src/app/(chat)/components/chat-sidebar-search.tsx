"use client";

import { CustomInputGroup } from "@/components/ui-custom/input-group";
import { InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useSidebar } from "@/components/ui/sidebar";
import { Search } from "lucide-react";

interface ChatSidebarSearchProps {
  search: string;
  setSearch: (search: string) => void;
}

export function ChatSidebarSearch({
  search,
  setSearch,
}: ChatSidebarSearchProps) {
  const { open } = useSidebar();

  return (
    <CustomInputGroup className="min-w-47">
      <InputGroupInput
        tabIndex={open ? undefined : -1}
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </CustomInputGroup>
  );
}
