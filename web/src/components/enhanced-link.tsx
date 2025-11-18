import { cn } from "@/lib/utils";
import Link from "next/link";
import { ComponentProps, useId } from "react";
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
  ...linkProps
}: EnhancedLinkProps) {
  const id = useId();

  const Parent = asButton ? ButtonWrapper : FragmentWrapper;

  return (
    <Parent {...buttonProps}>
      <Link
        id={enableLinkStatus ? id : undefined}
        prefetch={true}
        className={cn("group/link", linkClassname)}
        {...linkProps}
      >
        {enableLinkStatus && <EnhancedLinkClient id={id} />}
        {children}
      </Link>
    </Parent>
  );
}

function ButtonWrapper(props: ComponentProps<typeof Button>) {
  return <Button asChild {...props} />;
}

function FragmentWrapper({ children }: ComponentProps<typeof Button>) {
  return <>{children}</>;
}
