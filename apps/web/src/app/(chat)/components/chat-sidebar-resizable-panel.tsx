"use client";

import { ResizablePanel } from "@/components/ui/resizable";
import { useSidebar } from "@/components/ui/sidebar";
import { PanelHandle } from "@window-splitter/react";
import BezierEasing from "bezier-easing";
import { ComponentProps, useCallback, useEffect, useRef } from "react";

interface ChatSidebarResizablePanelProps extends ComponentProps<
  typeof ResizablePanel
> {}

export function ChatSidebarResizablePanel(
  props: ChatSidebarResizablePanelProps,
) {
  const panelHandle = useRef<PanelHandle>(null);

  const { open, setOpen } = useSidebar();

  const collapseChangeHandler = useCallback(
    (isCollapsed: boolean) => setOpen(!isCollapsed),
    [setOpen],
  );

  useEffect(() => {
    if (open) panelHandle.current?.expand();
    else panelHandle.current?.collapse();
  }, [open]);

  return (
    <ResizablePanel
      handle={panelHandle}
      onCollapseChange={collapseChangeHandler}
      min="256px"
      default="320px"
      max="384px"
      // isStaticAtRest // TODO can't use but it's a good prop, could make a pr to the library's repo to fix it
      collapsible
      collapsedSize="60px"
      collapseAnimation={{
        duration: 300,
        easing: BezierEasing(0.4, 0, 0.2, 1),
      }}
      {...props}
    />
  );
}
