import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu } from "lucide-react";

interface SidebarMenuProps {
  onNewChat?: () => void;
  onDeleteAll?: () => void;
}

export default function SidebarMenuIcon({
  onNewChat,
  onDeleteAll,
}: SidebarMenuProps) {
  return (
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
        <DropdownMenuItem className="cursor-pointer" onSelect={onNewChat}>
          New Chat
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onSelect={onDeleteAll}>
          Delete All Chats
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
