import { CreateOrganizationDialog } from "@/components/auth/organization/create-organization-dialog";
import { EnhancedLink } from "@/components/enhanced-link";
import {
  CustomDropdownMenuContent,
  CustomDropdownMenuItem,
} from "@/components/ui-custom/dropdown-menu";
import { CustomSidebarGroupAction } from "@/components/ui-custom/sidebar";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { Bot, MessagesSquare, Pencil, Users } from "lucide-react";
import { ComponentProps, useState } from "react";

interface ChatSidebarAddActionProps extends Omit<
  ComponentProps<typeof DropdownMenu>,
  "children"
> {}

export function ChatSidebarAddAction(props: ChatSidebarAddActionProps) {
  const { open } = useSidebar();
  const { setCurrentChatId } = useChatHistoryStore();
  const [organizationDialogOpen, setOrganizationDialogOpen] = useState(false);

  return (
    <>
      <CreateOrganizationDialog
        onOpenChange={setOrganizationDialogOpen}
        open={organizationDialogOpen}
      />
      <DropdownMenu {...props}>
        <DropdownMenuTrigger asChild>
          <CustomSidebarGroupAction title="Add">
            <Pencil /> <span className="sr-only">Add</span>
          </CustomSidebarGroupAction>
        </DropdownMenuTrigger>
        <CustomDropdownMenuContent
          side="top"
          sideOffset={12}
          align={open ? "end" : "center"}
        >
          <DropdownMenuGroup>
            <CustomDropdownMenuItem asChild>
              <EnhancedLink
                onClick={() => setCurrentChatId(undefined)}
                asButton={false}
                href="/chat"
              >
                <MessagesSquare />
                New Chat
              </EnhancedLink>
            </CustomDropdownMenuItem>
            <CustomDropdownMenuItem asChild>
              <EnhancedLink asButton={false} href="/agents">
                <Bot />
                New Agent
              </EnhancedLink>
            </CustomDropdownMenuItem>
            <CustomDropdownMenuItem
              onClick={() => setOrganizationDialogOpen(true)}
            >
              <Users />
              New Organization
            </CustomDropdownMenuItem>
          </DropdownMenuGroup>
        </CustomDropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
