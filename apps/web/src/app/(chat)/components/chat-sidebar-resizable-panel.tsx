"use client";

import { ResizablePanel } from "@/components/ui/resizable";
import { useSidebar } from "@/components/ui/sidebar";
import { PanelHandle } from "@window-splitter/react";
import { ComponentProps, useCallback, useEffect, useRef } from "react";

interface ChatSidebarResizablePanelProps
  extends ComponentProps<typeof ResizablePanel> {}

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
      {...props}
    />
  );
}
