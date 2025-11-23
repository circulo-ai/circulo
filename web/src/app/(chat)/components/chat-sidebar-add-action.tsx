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
import { Bot, MessagesSquare, Pencil, Users } from "lucide-react";
import { ComponentProps } from "react";

interface ChatSidebarAddActionProps
  extends Omit<ComponentProps<typeof DropdownMenu>, "children"> {}

export function ChatSidebarAddAction(props: ChatSidebarAddActionProps) {
  const { open } = useSidebar();

  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger asChild>
        <CustomSidebarGroupAction title="Add Chat">
          <Pencil /> <span className="sr-only">Add Chat</span>
        </CustomSidebarGroupAction>
      </DropdownMenuTrigger>
      <CustomDropdownMenuContent sideOffset={8} align={open ? "end" : "start"}>
        <DropdownMenuGroup>
          <CustomDropdownMenuItem>
            <MessagesSquare />
            New Chat
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
