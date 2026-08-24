"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import * as React from "react";

function Collapsible({
  asChild = false,
  children,
  ...props
}: CollapsiblePrimitive.Root.Props & {
  asChild?: boolean;
}) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Root>
  );
}

function CollapsibleTrigger({
  asChild = false,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props & {
  asChild?: boolean;
}) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      render={asChild && React.isValidElement(children) ? children : undefined}
      nativeButton={asChild ? false : undefined}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Trigger>
  );
}

function CollapsibleContent({
  asChild = false,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props & {
  asChild?: boolean;
}) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Panel>
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
