"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";

type NavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
};

type DesktopBridge = {
  controlsSide: "left" | "right";
  runtimeInfo: () => Promise<{ apiUrl: string }>;
  getNavigationState: () => Promise<NavigationState>;
  writeClipboardText: (text: string) => Promise<void>;
  writeClipboardImage: (dataUrl: string) => Promise<void>;
  navigateBack: () => void;
  navigateForward: () => void;
  onNavigationState: (listener: (state: NavigationState) => void) => () => void;
};

declare global {
  interface Window {
    circuloDesktop?: DesktopBridge;
  }
}

export function DesktopWindowToolbar() {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    canGoBack: false,
    canGoForward: false,
  });

  useEffect(() => {
    const desktop = window.circuloDesktop;
    if (!desktop) return;

    document.documentElement.dataset.circuloDesktop = "true";
    if (toolbarRef.current) {
      toolbarRef.current.dataset.controlSide = desktop.controlsSide;
    }

    const unsubscribe = desktop.onNavigationState(setNavigationState);
    void desktop
      .getNavigationState()
      .then(setNavigationState)
      .catch(() =>
        setNavigationState({ canGoBack: false, canGoForward: false }),
      );

    return unsubscribe;
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: <explanation>
    <div
      ref={toolbarRef}
      id="circulo-desktop-window-toolbar"
      className="circulo-desktop-window-toolbar"
      data-control-side="right"
      role="region"
      aria-label="Desktop window toolbar"
    >
      <div className="circulo-desktop-window-actions">
        <button
          type="button"
          className="circulo-desktop-window-button"
          aria-label="Go back"
          title="Go back"
          disabled={!navigationState.canGoBack}
          onClick={() => window.circuloDesktop?.navigateBack()}
        >
          <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="circulo-desktop-window-button"
          aria-label="Go forward"
          title="Go forward"
          disabled={!navigationState.canGoForward}
          onClick={() => window.circuloDesktop?.navigateForward()}
        >
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <div className="flex items-center gap-1.5">
          <Logo className="h-5 w-auto" />
          <h1 className="text-lg leading-none font-medium tracking-tight">
            Circulo
          </h1>
        </div>
      </div>
      <div
        className="circulo-desktop-window-drag-area"
        aria-hidden="true"
        title="Drag to move the window"
      />
    </div>
  );
}
