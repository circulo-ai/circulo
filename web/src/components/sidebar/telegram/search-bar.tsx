"use client"

import { Menu, Search, Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SearchBarProps {
  onNewChat?: () => void
  onDeleteAll?: () => void
}

export function SearchBar({ onNewChat, onDeleteAll }: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem className="cursor-pointer" onSelect={onNewChat}>New Chat</DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={onDeleteAll}>Delete All Chats</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center flex-1 bg-accent/50 rounded-lg px-3 py-1.5">
        <Search className="h-4 w-4 text-muted-foreground mr-2" />
        <Input
          placeholder="Search"
          className="border-0 !bg-transparent p-0 h-6 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  )
}
