"use client";

import { Account } from "@/components/sidebar/settings-modal/components/account/account";
import { AIProviders } from "@/components/sidebar/settings-modal/components/ai-providers/ai-providers";
import { General } from "@/components/sidebar/settings-modal/components/general/general";
import { SettingsNavigation } from "@/components/sidebar/settings-modal/components/settings-navigation/settings-navigation";
import { Team } from "@/components/sidebar/settings-modal/components/team/team";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubscriptionUsageIndicator } from "@/components/usage-indicator";
import { authClient } from "@/lib/auth-client";
import { isBillingEnabled } from "@/lib/environment";
import { createLogger } from "@/lib/logs/console/logger";
import { useGeneralStore } from "@/stores/settings/general/store";
import { useEffect, useState } from "react";

const logger = createLogger("SettingsModal");

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsSection =
  | "general"
  | "account"
  | "ai-providers"
  | "subscription"
  | "team";

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");
  const [, setIsLoading] = useState(true);
  const loadSettings = useGeneralStore((state) => state.loadSettings);
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [hasLoadedGeneral, setHasLoadedGeneral] = useState(false);

  useEffect(() => {
    async function loadGeneralIfNeeded() {
      if (!open) return;
      if (activeSection !== "general") return;
      if (hasLoadedGeneral) return;
      setIsLoading(true);
      try {
        await loadSettings();
        setHasLoadedGeneral(true);
      } catch (error) {
        logger.error("Error loading general settings:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (open) {
      void loadGeneralIfNeeded();
    } else {
      setHasLoadedGeneral(false);
    }
  }, [open, activeSection, hasLoadedGeneral, loadSettings]);

  useEffect(() => {
    const handleOpenSettings = (
      event: CustomEvent<{ tab: SettingsSection }>,
    ) => {
      setActiveSection(event.detail.tab);
      onOpenChange(true);
    };

    window.addEventListener(
      "open-settings",
      handleOpenSettings as EventListener,
    );

    return () => {
      window.removeEventListener(
        "open-settings",
        handleOpenSettings as EventListener,
      );
    };
  }, [onOpenChange]);

  // Redirect away from billing tabs if billing is disabled
  useEffect(() => {
    if (!isBillingEnabled && activeSection === "subscription") {
      setActiveSection("general");
    }
  }, [activeSection]);

  // Handle dialog close - delegate to environment component if it's active
  const handleDialogOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex h-[70vh] flex-col gap-0 p-0 sm:max-w-[840px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg font-medium">Settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Navigation Sidebar */}
          <div className="w-[180px]">
            <SettingsNavigation
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              hasOrganization={Boolean(activeOrganization)}
            />
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {activeSection === "general" && (
              <div className="h-full">
                <General />
              </div>
            )}
            {activeSection === "account" && (
              <div className="h-full">
                <Account onOpenChange={onOpenChange} />
              </div>
            )}
            {activeSection === "ai-providers" && <AIProviders />}
            {activeSection === "subscription" && isBillingEnabled && (
              <div className="p-6">
                <h2 className="mb-2 text-base font-medium">Subscription</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Review your current plan and usage.
                </p>
                <SubscriptionUsageIndicator />
              </div>
            )}
            {activeSection === "team" && activeOrganization && <Team />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
