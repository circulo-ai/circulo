import { cn } from "@/lib/utils";
import { Icon } from "@/types/icon";
import { ComponentProps } from "react";

interface IconBoxProps extends ComponentProps<"div"> {
  icon: Icon;
}

export function IconBox({ icon: Icon, className, ...props }: IconBoxProps) {
  return (
    <div
      className={cn("rounded-md border-2 border-teal-50/10 p-2", className)}
      {...props}
    >
      <Icon className="size-4 text-foreground/75" />
    </div>
  );
}
