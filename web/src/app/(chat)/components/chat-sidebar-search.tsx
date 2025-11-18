"use client";

import { CustomInputGroup } from "@/components/ui-custom/input-group";
import { InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Search } from "lucide-react";

export function ChatSidebarSearch() {
  return (
    <CustomInputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </CustomInputGroup>
  );
}
