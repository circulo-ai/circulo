"use client";

import {
  CustomDropdownMenuContent,
  CustomDropdownMenuItem,
} from "@/components/ui-custom/dropdown-menu";
import { WithRipple } from "@/components/ui-custom/ripple";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
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
  const { open } = useSidebar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <WithRipple
          component={Button}
          componentProps={{
            variant: "ghost-sidebar",
            rounded: "full",
            size: "icon",
            className: cn(""),
          }}
        >
          <TextAlignJustify />
        </WithRipple>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent
        sideOffset={8}
        alignOffset={open ? 0 : 8}
        align="start"
      >
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
