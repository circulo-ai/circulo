"use client";

import { CreateOrganizationDialog } from "@/components/auth/organization/create-organization-dialog";
import { UserView } from "@/components/auth/user/user-view";
import {
  CustomDropdownMenuContent,
  CustomDropdownMenuItem,
} from "@/components/ui-custom/dropdown-menu";
import { Ripple } from "@/components/ui-custom/ripple";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { clearUserData } from "@/stores";
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
import { toast } from "sonner";

export function ChatSidebarBurgerMenu() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        throw new Error(result.error.message ?? "Unable to sign out");
      }
      await clearUserData();
      setSignOutOpen(false);
      router.replace("/auth/sign-in?fromLogout=true");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to sign out",
      );
    } finally {
      setSigningOut(false);
    }
  };
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
          {organizations
            ?.filter((e: { id: string }) => e.id !== activeOrganization?.id)
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
        <CustomDropdownMenuItem onClick={() => setSignOutOpen(true)}>
          <LogOut />
          Sign out
        </CustomDropdownMenuItem>
      </CustomDropdownMenuContent>
      <AlertDialog
        onOpenChange={(nextOpen) => !signingOut && setSignOutOpen(nextOpen)}
        open={signOutOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Circulo?</AlertDialogTitle>
            <AlertDialogDescription>
              You can sign in again anytime. Your chats and workspace data will
              remain saved to your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={signingOut}
              onClick={(event) => {
                event.preventDefault();
                void confirmSignOut();
              }}
              variant="destructive"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DropdownMenu>
  );
}
