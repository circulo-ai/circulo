import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, HTMLAttributes } from "react";
import { Mention } from "@/lib/chat/mentions/types";
import { segmentTextWithMentions } from "@/lib/chat/mentions/client";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export type MessageContentWithMentionsProps = MessageContentProps & {
  mentions?: Mention[];
  onMentionClick?: (mention: Mention) => void;
};

export const MessageContentWithMentions = ({
                                             children,
                                             className,
                                             variant,
                                             mentions = [],
                                             onMentionClick,
                                             ...props
                                           }: MessageContentWithMentionsProps) => {
  // If children is a string, segment it with mentions
  const content = typeof children === "string" ? children : null;
  const segments = content ? segmentTextWithMentions(content, mentions) : null;

  return (
    <MessageContent className={className} variant={variant} {...props}>
      {segments ? (
        <div className="whitespace-pre-wrap break-words">
          {segments.map((segment, index) => {
            if (segment.isMention && segment.mention) {
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onMentionClick?.(segment.mention!)}
                  className={cn(
                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors",
                    segment.mention.type === "agent"
                      ? "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                      : "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50",
                    "group-[.is-user]:opacity-90",
                  )}
                >
                  {segment.text}
                </button>
              );
            }
            return <span key={index}>{segment.text}</span>;
          })}
        </div>
      ) : (
        children
      )}
    </MessageContent>
  );
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-end justify-end gap-2 py-4",
      from === "user" ? "is-user" : "is-assistant flex-row-reverse justify-end",
      className,
    )}
    {...props}
  />
);

const messageContentVariants = cva(
  "is-user:dark flex flex-col gap-2 overflow-hidden rounded-lg text-sm",
  {
    variants: {
      variant: {
        contained: [
          "max-w-[80%] px-4 py-3",
          "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
          "group-[.is-assistant]:bg-secondary group-[.is-assistant]:text-foreground",
        ],
        flat: [
          "group-[.is-user]:bg-secondary group-[.is-user]:text-foreground group-[.is-user]:max-w-[80%] group-[.is-user]:px-4 group-[.is-user]:py-3",
          "group-[.is-assistant]:text-foreground",
        ],
      },
    },
    defaultVariants: {
      variant: "contained",
    },
  },
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants>;

export const MessageContent = ({
  children,
  className,
  variant,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(messageContentVariants({ variant, className }))}
    {...props}
  >
    {children}
  </div>
);

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar className={cn("ring-border size-8 ring-1", className)} {...props}>
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2) || "ME"}</AvatarFallback>
  </Avatar>
);
