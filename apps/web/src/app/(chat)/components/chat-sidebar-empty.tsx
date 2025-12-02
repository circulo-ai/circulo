import { EnhancedLink } from "@/components/enhanced-link";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarMenuAvatar,
  CustomSidebarMenuButton,
} from "@/components/ui-custom/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ComponentProps } from "react";

interface ChatSidebarEmptyProps extends ComponentProps<"div"> {}

export function ChatSidebarEmpty({
  className,
  ...props
}: ChatSidebarEmptyProps) {
  const { open } = useSidebar();

  return (
    <div className={cn("flex justify-center", className)} {...props}>
      <Empty className="absolute w-full min-w-58 p-6! transition-opacity group-data-[state=collapsed]:pointer-events-none group-data-[state=collapsed]:opacity-0">
        <EmptyHeader>
          <EmptyMedia>
            <div className="flex -space-x-2 *:data-[slot=avatar]:size-12 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:grayscale">
              <Avatar>
                <AvatarImage src="/steve-jobs.jpg" alt="Steve Jobs" />
                <AvatarFallback>SJ</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarImage src="/elon-musk.jpg" alt="Elon Musk" />
                <AvatarFallback>EM</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarImage src="/bill-gates.jpg" alt="Bill Gates" />
                <AvatarFallback>BG</AvatarFallback>
              </Avatar>
            </div>
          </EmptyMedia>
          <EmptyTitle className="truncate tracking-normal">
            "One chat to rule them all"
          </EmptyTitle>
          <EmptyDescription>
            Create a chat to start orchestrating your AI agents
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <WithRipple
            component={EnhancedLink}
            tabIndex={open ? undefined : -1}
            componentProps={{
              enableLinkStatus: false,
              href: `/chat`,
              className: cn("[&_.ripple]:bg-neutral-950/15"),
              buttonProps: {
                size: "sm",
                variant: "primary",
              },
            }}
          >
            <Plus /> Add Chat
          </WithRipple>
        </EmptyContent>
      </Empty>

      <SidebarMenuItem className="pointer-events-none mt-6 opacity-0 transition-all group-data-[state=collapsed]:pointer-events-auto group-data-[state=collapsed]:-translate-x-0.75 group-data-[state=collapsed]:opacity-100">
        <CustomSidebarMenuButton
          variant="primary"
          className="rounded-full p-0"
          asChild
        >
          <WithRipple
            component={EnhancedLink}
            tabIndex={open ? -1 : undefined}
            componentProps={{
              enableLinkStatus: false,
              asButton: false,
              href: `/chat`,
              className: cn("[&_.ripple]:bg-neutral-950/15"),
            }}
          >
            <CustomSidebarMenuAvatar className="flex items-center justify-center bg-transparent">
              <Plus className="size-4 text-background" />
            </CustomSidebarMenuAvatar>
          </WithRipple>
        </CustomSidebarMenuButton>
      </SidebarMenuItem>
    </div>
  );
}
