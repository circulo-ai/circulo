import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { isValidElement } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        primary: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-input/30 hover:bg-input/50 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        "ghost-sidebar":
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "sidebar-menu-badge":
          "bg-sidebar-accent text-sidebar-accent-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
        text: "text-muted-foreground hover:text-foreground",
        highlightedText: "text-primary hover:text-primary/80",
        reversedText: "text-background hover:text-background/80",
        icon: "bg-muted text-foreground hover:bg-muted/80",
      },
      size: {
        default: "h-9 gap-1.5 px-3",
        xs: "h-6 gap-1 px-2.5 text-xs",
        sm: "h-8 gap-1 px-3",
        lg: "h-10 gap-1.5 px-4",
        text: "h-auto gap-1 px-0 text-sm",
        wide: "h-9 gap-2 px-5",
        wider: "h-10 gap-2 px-6",
        "lg-wider": "h-11 gap-2 px-7",
        "lg-widest": "h-12 gap-2 px-8",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-md": "size-10",
        "icon-lg": "size-10",
      },
      rounded: {
        none: "rounded-none",
        sm: "rounded-md",
        md: "rounded-xl",
        lg: "rounded-2xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      rounded: undefined,
    },
  },
);

type ButtonProps = ButtonPrimitive.Props & {
  variant?:
    | "default"
    | "primary"
    | "outline"
    | "secondary"
    | "ghost"
    | "ghost-sidebar"
    | "sidebar-menu-badge"
    | "destructive"
    | "link"
    | "text"
    | "highlightedText"
    | "reversedText"
    | "icon";
  size?:
    | "default"
    | "xs"
    | "sm"
    | "lg"
    | "text"
    | "wide"
    | "wider"
    | "lg-wider"
    | "lg-widest"
    | "icon"
    | "icon-xs"
    | "icon-sm"
    | "icon-md"
    | "icon-lg";
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  asChild?: boolean;
  children?: ReactNode;
};

function Button({
  className,
  variant = "default",
  size = "default",
  rounded,
  asChild,
  children,
  render,
  nativeButton: nativeButtonProp,
  ...props
}: ButtonProps) {
  const childRender = asChild && isValidElement(children) ? children : render;
  const nativeButton = nativeButtonProp ?? (childRender ? false : undefined);

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, rounded, className }))}
      render={childRender}
      nativeButton={nativeButton}
      {...props}
    >
      {asChild && isValidElement(children) ? null : children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
