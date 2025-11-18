import { env, isTruthy } from "@/lib/env";
import { isHosted } from "@/lib/environment";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";
import { useGeneralStore } from "@/stores/settings/general/store";
import { CreditCard, Home, Settings, Shield, User, Users } from "lucide-react";

const isBillingEnabled = isTruthy(env.NEXT_PUBLIC_BILLING_ENABLED);

interface SettingsNavigationProps {
  activeSection: string;
  onSectionChange: (
    section: "general" | "account" | "subscription" | "team" | "privacy",
  ) => void;
  hasOrganization: boolean;
}

type NavigationItem = {
  id: "general" | "account" | "subscription" | "team" | "privacy";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hideWhenBillingDisabled?: boolean;
  requiresTeam?: boolean;
  requiresEnterprise?: boolean;
  requiresOwner?: boolean;
};

const allNavigationItems: NavigationItem[] = [
  {
    id: "general",
    label: "General",
    icon: Settings,
  },
  {
    id: "account",
    label: "Account",
    icon: User,
  },
  {
    id: "privacy",
    label: "Privacy",
    icon: Shield,
  },
  {
    id: "subscription",
    label: "Subscription",
    icon: CreditCard,
    hideWhenBillingDisabled: true,
  },
  {
    id: "team",
    label: "Team",
    icon: Users,
    hideWhenBillingDisabled: true,
    requiresTeam: true,
  },
];

export function SettingsNavigation({
  activeSection,
  onSectionChange,
  hasOrganization,
}: SettingsNavigationProps) {
  console.log(isBillingEnabled);
  const { data: session } = useSession();

  const navigationItems = allNavigationItems.filter((item) => {
    if (item.hideWhenBillingDisabled && !isBillingEnabled) {
      return false;
    }

    if (item.requiresTeam && !hasOrganization) {
      return false;
    }

    return true;
  });

  const handleHomepageClick = () => {
    window.location.href = "/?from=settings";
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {navigationItems.map((item) => (
          <div key={item.id} className="mb-1">
            <button
              onMouseEnter={() => {
                switch (item.id) {
                  case "general":
                    useGeneralStore.getState().loadSettings();
                    break;
                  default:
                    break;
                }
              }}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "group flex h-9 w-full cursor-pointer items-center rounded-[8px] px-2 py-2 font-sans text-sm font-medium transition-colors",
                activeSection === item.id ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <item.icon
                className={cn(
                  "mr-2 h-[14px] w-[14px] flex-shrink-0 transition-colors",
                  activeSection === item.id
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate pr-1 text-left transition-colors select-none",
                  activeSection === item.id
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {item.label}
              </span>
            </button>
          </div>
        ))}
      </div>

      {/* Homepage link */}
      {isHosted && (
        <div className="px-2 pb-4">
          <button
            onClick={handleHomepageClick}
            className="group flex h-9 w-full cursor-pointer items-center rounded-[8px] px-2 py-2 font-sans text-sm font-medium transition-colors hover:bg-muted"
          >
            <Home className="mr-2 h-[14px] w-[14px] flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span className="min-w-0 flex-1 truncate pr-1 text-left text-muted-foreground transition-colors select-none group-hover:text-foreground">
              Homepage
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
