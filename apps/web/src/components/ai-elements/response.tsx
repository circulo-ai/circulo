"use client";

import { CHAT_CODE_THEMES } from "@/lib/code-theme";
import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(({ className, ...props }: ResponseProps) => (
  <Streamdown
    shikiTheme={CHAT_CODE_THEMES}
    className={cn(
      "chat-markdown size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
      className,
    )}
    {...props}
  />
));

Response.displayName = "Response";
