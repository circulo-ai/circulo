import Link from "next/link";
import { ComponentProps } from "react";
import { Button } from "./ui/button";

interface EnhancedLinkProps extends ComponentProps<typeof Link> {
  buttonProps?: ComponentProps<typeof Button>;
}

export function EnhancedLink({ buttonProps, ...linkProps }: EnhancedLinkProps) {
  return (
    <Button asChild {...buttonProps}>
      <Link prefetch={true} {...linkProps} />
    </Button>
  );
}
