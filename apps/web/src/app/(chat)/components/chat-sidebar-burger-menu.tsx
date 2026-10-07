"use client";

import { CreateOrganizationDialog } from "@/components/auth/organization/create-organization-dialog";
import { UserView } from "@/components/auth/user/user-view";
import {
  CustomDropdownMenuContent,
  CustomDropdownMenuItem,
} from "@/components/ui-custom/dropdown-menu";
import { Ripple } from "@/components/ui-custom/ripple";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient, useSession } from "@/lib/auth-client";
import { isBillingEnabled } from "@/lib/environment";
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
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChatSidebarBurgerMenu() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const [open, setOpen] = useState(false);
  const navigate = (href: string) => {
    router.push(href, { scroll: false });
  };

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
          <DropdownMenuLabel className="px-3 py-2">
            <div className="min-w-0">
              <UserView
                user={session?.user}
                isPending={isPending}
                hideSubtitle
                className="gap-2"
              />
              {activeOrganization?.name && (
                <div className="truncate pl-9 text-xs text-muted-foreground">
                  {activeOrganization.name}
                </div>
              )}
            </div>
          </DropdownMenuLabel>
          {organizations &&
            organizations
              .filter((e: { id: string }) => e.id !== activeOrganization?.id)
              .map((e: { id: string; name?: string | null }) => (
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
          <CustomDropdownMenuItem onClick={() => navigate("/workspace")}>
            <Settings />
            Workspace
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem onClick={() => navigate("/agents")}>
            <Bot />
            Agents
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem onClick={() => navigate("/knowledge")}>
            <LibraryBig />
            Knowledge
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem onClick={() => navigate("/memory")}>
            <Brain />
            Memory
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem onClick={() => navigate("/automation")}>
            <CalendarClock />
            Automation
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem onClick={() => navigate("/plugins")}>
            <Plug />
            Plugins
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem
            onClick={() => navigate("/workspace?section=tools")}
          >
            <Settings />
            Tools & MCP
          </CustomDropdownMenuItem>
          {isBillingEnabled && (
            <CustomDropdownMenuItem onClick={() => navigate("/pricing")}>
              <CreditCard />
              Billing
            </CustomDropdownMenuItem>
          )}
          <CustomDropdownMenuItem
            onClick={() => navigate("/workspace?section=account")}
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
