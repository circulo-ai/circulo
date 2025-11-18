"use client";

import {
  CustomDropdownMenuContent,
  CustomDropdownMenuItem,
} from "@/components/ui-custom/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useUser } from "@/hooks/api/chats/use-user";
import {
  Bot,
  CreditCard,
  LibraryBig,
  LogOut,
  Settings,
  TextAlignJustify,
} from "lucide-react";

export function ChatSidebarBurgerMenu() {
  const { user, isLoading } = useUser();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost-sidebar" rounded="full" size="icon">
          <TextAlignJustify />
        </Button>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent sideOffset={8} align="start">
        <DropdownMenuGroup>
          <CustomDropdownMenuItem>
            <UserAvatar user={user} isPending={isLoading} size="xs" />
            {user?.name}
          </CustomDropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <CustomDropdownMenuItem>
            <Bot />
            Agents
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem>
            <LibraryBig />
            Knowledge
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem>
            <CreditCard />
            Billing
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem>
            <Settings />
            Settings
          </CustomDropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <CustomDropdownMenuItem>
          <LogOut />
          Sign out
        </CustomDropdownMenuItem>
      </CustomDropdownMenuContent>
    </DropdownMenu>
  );
}

// TODO implement keyboard shortcuts
