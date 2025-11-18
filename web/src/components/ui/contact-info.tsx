import { cn } from "@/lib/utils";
import { Icon } from "@/types/icon";
import { ComponentProps } from "react";
import { IconBox } from "./icon-box";

interface ContactInfoCardProps extends ComponentProps<"div"> {
  icon: Icon;
  title: string;
}

export function ContactInfoCard({
  icon,
  title,
  className,
  ...props
}: ContactInfoCardProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <IconBox icon={icon} className="p-1.5" />
        <div className="font-semibold">{title}</div>
      </div>

      <div
        className={cn(
          "flex flex-col items-start gap-2 text-foreground/75",
          className,
        )}
        {...props}
      />
    </div>
  );
}
