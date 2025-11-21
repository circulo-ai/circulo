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
import { useSession } from "@/providers/session-provider";
import {
  Bot,
  CreditCard,
  LibraryBig,
  LogOut,
  Settings,
  TextAlignJustify,
} from "lucide-react";

export function ChatSidebarBurgerMenu() {
  const { data, isPending } = useSession();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-sidebar"
          rounded="full"
          size="icon"
          className="group-data-[state=collapsed]:h-13 group-data-[state=collapsed]:w-full group-data-[state=collapsed]:rounded-none"
        >
          <TextAlignJustify />
        </Button>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent>
        <DropdownMenuGroup>
          <CustomDropdownMenuItem>
            <UserAvatar user={data?.user} isPending={isPending} size="xs" />
            {data?.user?.name ?? "Loading..."}
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
