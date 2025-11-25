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
import { UserAvatar } from "@/components/ui/user-avatar";
import { authClient } from "@/lib/auth-client";
import { useOrganizationsHooks, useSession } from "@/providers/session-provider";
import { CreateOrganizationDialog } from "@daveyplate/better-auth-ui";
import {
  Bot,
  CreditCard,
  LibraryBig,
  LogOut,
  Plus,
  Settings,
  TextAlignJustify,
} from "lucide-react";
import { useState } from "react";

export function ChatSidebarBurgerMenu() {
  const { data: session, isPending: isLoading } = useSession();
  const { useActiveOrganization, useListOrganizations } =
    useOrganizationsHooks();
  const { data: activeOrganization } = useActiveOrganization();
  const { data: organizations } = useListOrganizations();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu>
      <CreateOrganizationDialog open={open} onOpenChange={setOpen} />
      <DropdownMenuTrigger asChild>
        <WithRipple
          component={Button}
          componentProps={{
            variant: "ghost-sidebar",
            rounded: "full",
            size: "icon",
          }}
        >
          <TextAlignJustify />
        </WithRipple>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent sideOffset={8} align="start">
        <DropdownMenuGroup>
          <CustomDropdownMenuItem>
            <UserAvatar user={session?.user} isPending={isLoading} size="xs" />
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
