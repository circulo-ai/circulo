"use client";

import { CustomInputGroup } from "@/components/ui-custom/input-group";
import { InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Search } from "lucide-react";

interface ChatSidebarSearchProps {
  search: string;
  setSearch: (search: string) => void;
}

export function ChatSidebarSearch({
  search,
  setSearch,
}: ChatSidebarSearchProps) {
  return (
    <CustomInputGroup>
      <InputGroupInput
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
