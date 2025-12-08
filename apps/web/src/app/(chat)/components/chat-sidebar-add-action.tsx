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
import { ComponentProps } from "react";

interface ChatSidebarAddActionProps extends Omit<
  ComponentProps<typeof DropdownMenu>,
  "children"
> {}

export function ChatSidebarAddAction(props: ChatSidebarAddActionProps) {
  const { open } = useSidebar();
  const { setCurrentChatId } = useChatHistoryStore();

  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger asChild>
        <CustomSidebarGroupAction title="Add">
          <Pencil /> <span className="sr-only">Add</span>
        </CustomSidebarGroupAction>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent sideOffset={8} align={open ? "end" : "start"}>
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
          <CustomDropdownMenuItem>
            <Bot />
            New Agent
          </CustomDropdownMenuItem>
          <CustomDropdownMenuItem>
            <Users />
            New Organization
          </CustomDropdownMenuItem>
        </DropdownMenuGroup>
      </CustomDropdownMenuContent>
    </DropdownMenu>
  );
}
