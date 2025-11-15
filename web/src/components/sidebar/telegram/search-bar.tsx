"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import SidebarMenuIcon from "./sidebar-menu-icon";

interface SearchBarProps {
  hideSearhField?: boolean;
  onNewChat?: () => void;
  onDeleteAll?: () => void;
}

export function SearchBar({
  onNewChat,
  onDeleteAll,
  hideSearhField,
}: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <SidebarMenuIcon onNewChat={onNewChat} onDeleteAll={onDeleteAll} />
      {!hideSearhField && (
        <div className="bg-accent/50 flex flex-1 items-center rounded-lg px-3 py-1.5">
          <Search className="text-muted-foreground mr-2 h-4 w-4" />
          <Input
            placeholder="Search"
            className="placeholder:text-muted-foreground h-6 border-0 !bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      )}
    </div>
  );
}
