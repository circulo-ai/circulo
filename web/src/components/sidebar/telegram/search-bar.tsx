"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Menu, Search } from "lucide-react";

interface SearchBarProps {
  onNewChat?: () => void;
  onDeleteAll?: () => void;
}

export function SearchBar({ onNewChat, onDeleteAll }: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-8 w-8"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem className="cursor-pointer" onSelect={onNewChat}>
            New Chat
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={onDeleteAll}>
            Delete All Chats
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="bg-accent/50 flex flex-1 items-center rounded-lg px-3 py-1.5">
        <Search className="text-muted-foreground mr-2 h-4 w-4" />
        <Input
          placeholder="Search"
          className="placeholder:text-muted-foreground h-6 border-0 !bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}
