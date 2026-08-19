"use client";

import { CustomInputGroup } from "@/components/ui-custom/input-group";
import {
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useSidebar } from "@/components/ui/sidebar";
import { Search, X } from "lucide-react";
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
  }, [open, setSearch]);

  useEffect(() => {
    if (!open) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("chat-history-search")?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open]);

  return (
    <CustomInputGroup className="min-w-47">
      <InputGroupInput
        id="chat-history-search"
        aria-label="Search chats and messages"
        disabled={open ? undefined : true}
        placeholder="Search chats and messages"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      {search && open && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="Clear chat search"
            onClick={() => setSearch("")}
            type="button"
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </CustomInputGroup>
  );
}

// TODO save search state when sidebar collapses and use it when it extends
