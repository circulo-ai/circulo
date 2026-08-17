"use client";

import {
  CustomDropdownMenuContent,
  CustomDropdownMenuItem,
} from "@/components/ui-custom/dropdown-menu";
import { Ripple } from "@/components/ui-custom/ripple";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { authClient, useSession } from "@/lib/auth-client";
import { CreateOrganizationDialog } from "@daveyplate/better-auth-ui";
import {
  Bot,
  Brain,
  CalendarClock,
  CreditCard,
  LibraryBig,
  LogOut,
  Plug,
  Plus,
  Settings,
  TextAlignJustify,
} from "lucide-react";
import { useState } from "react";

export function ChatSidebarBurgerMenu() {
  const { data: session, isPending } = useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu>
      <CreateOrganizationDialog open={open} onOpenChange={setOpen} />
      <DropdownMenuTrigger asChild>
        <Ripple asChild>
          <Button variant="ghost-sidebar" rounded="full" size="icon">
            <TextAlignJustify />
          </Button>
        </Ripple>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent sideOffset={8} align="start">
        <DropdownMenuGroup>
          <CustomDropdownMenuItem>
            <UserAvatar user={session?.user} isPending={isPending} size="xs" />
            {activeOrganization?.name}
          </CustomDropdownMenuItem>
          {organizations &&
            organizations
              .filter((e) => e.id != activeOrganization?.id)
              .map((e) => (
                <CustomDropdownMenuItem
                  key={`org-${e.id}`}
                  onClick={async () => {
                    await authClient.organization.setActive({
                      organizationId: e.id,
                    });
                  }}
                >
                  {e?.name}
                </CustomDropdownMenuItem>
              ))}
          <CustomDropdownMenuItem
            onClick={() => {
              setOpen(true);
            }}
          >
            <Plus />
            New Workspace
          </CustomDropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/workspace")}
          >
            <Settings />
            Workspace
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/agents")}
          >
            <Bot />
            Agents
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/knowledge")}
          >
            <LibraryBig />
            Knowledge
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/memory")}
          >
            <Brain />
            Memory
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/automation")}
          >
            <CalendarClock />
            Automation
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/plugins")}
          >
            <Plug />
            Plugins
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/workspace?section=tools")}
          >
            <Settings />
            Tools & MCP
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/pricing")}
          >
            <CreditCard />
            Billing
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => window.location.assign("/workspace?section=account")}
          >
            <Settings />
            Settings
          </CustomDropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <CustomDropdownMenuItem onClick={() => void authClient.signOut()}>
          <LogOut />
          Sign out
        </CustomDropdownMenuItem>
      </CustomDropdownMenuContent>
    </DropdownMenu>
  );
}

// TODO implement keyboard shortcuts
