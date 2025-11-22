import { cn } from "@/lib/utils";
import Link from "next/link";
import { ComponentProps, useId, useMemo } from "react";
import { EnhancedLinkClient } from "./enhanced-link-client";
import { Button } from "./ui/button";

interface EnhancedLinkProps extends ComponentProps<typeof Link> {
  buttonProps?: ComponentProps<typeof Button>;
  enableLinkStatus?: boolean;
  asButton?: boolean;
}

export function EnhancedLink({
  children,
  buttonProps,
  enableLinkStatus = true,
  asButton = true,
  className: linkClassname,
  id: explicitId,
  ...linkProps
}: EnhancedLinkProps) {
  const implicitId = useId();
  const id = explicitId ?? implicitId;

  const mainElement = useMemo(
    () => (
      <Link
        id={id}
        prefetch={true}
        className={cn("group/link", linkClassname)}
        {...linkProps}
      >
        {enableLinkStatus && <EnhancedLinkClient id={id} />}
        {children}
      </Link>
    ),
    [enableLinkStatus, id, children, linkProps, linkClassname],
  );

  if (asButton) return <Button {...buttonProps}>{mainElement}</Button>;
  else return mainElement;
}
