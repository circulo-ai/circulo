"use client";

import { inter } from "@/app/fonts/inter";
import { Button } from "@/components/ui/button";
import { Spinner as LoadingAgent } from "@/components/ui/spinner";
import { useBrandConfig } from "@/lib/branding/branding";
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  RotateCcw,
  ShieldX,
  UserPlus,
  Users2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface InviteStatusCardProps {
  type: "login" | "loading" | "error" | "success" | "invitation" | "warning";
  title: string;
  description: string | React.ReactNode;
  icon?: "userPlus" | "mail" | "users" | "error" | "success" | "warning";
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
    disabled?: boolean;
    loading?: boolean;
  }>;
  isExpiredError?: boolean;
}

const iconMap = {
  userPlus: UserPlus,
  mail: Mail,
  users: Users2,
  error: ShieldX,
  success: CheckCircle2,
  warning: AlertCircle,
};

const iconColorMap = {
  userPlus: "text-[var(--brand-primary-hex)]",
  mail: "text-[var(--brand-primary-hex)]",
  users: "text-[var(--brand-primary-hex)]",
  error: "text-red-500 dark:text-red-400",
  success: "text-green-500 dark:text-green-400",
  warning: "text-yellow-600 dark:text-yellow-500",
};

const iconBgMap = {
  userPlus: "bg-[var(--brand-primary-hex)]/10",
  mail: "bg-[var(--brand-primary-hex)]/10",
  users: "bg-[var(--brand-primary-hex)]/10",
  error: "bg-red-50 dark:bg-red-950/20",
  success: "bg-green-50 dark:bg-green-950/20",
  warning: "bg-yellow-50 dark:bg-yellow-950/20",
};

export function InviteStatusCard({
  type,
  title,
  description,
  icon,
  actions = [],
  isExpiredError = false,
}: InviteStatusCardProps) {
  const router = useRouter();
  const [buttonClass, setButtonClass] = useState("auth-button-gradient");
  const brandConfig = useBrandConfig();

  useEffect(() => {
    const checkCustomBrand = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      const brandAccent = computedStyle
        .getPropertyValue("--brand-accent-hex")
        .trim();
      if (brandAccent && brandAccent !== "#6f3dfa") {
        setButtonClass("auth-button-custom");
      } else {
        setButtonClass("auth-button-gradient");
      }
    };
    checkCustomBrand();
    window.addEventListener("resize", checkCustomBrand);
    const observer = new MutationObserver(checkCustomBrand);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    return () => {
      window.removeEventListener("resize", checkCustomBrand);
      observer.disconnect();
    };
  }, []);

  if (type === "loading") {
    return (
      <div className={`${inter.className} space-y-6`}>
        <div className="space-y-1 text-center">
          <h1 className="text-[32px] font-medium tracking-tight text-black">
            Loading
          </h1>
          <p
            className={`${inter.className} text-muted-foreground text-[16px] font-[380]`}
          >
            {description}
          </p>
        </div>
        <div className="flex w-full items-center justify-center py-8">
          <LoadingAgent />
        </div>

        <div
          className={`${inter.className} auth-text-muted fixed right-0 bottom-0 left-0 z-50 pb-8 text-center text-[13px] leading-relaxed font-[340]`}
        >
          Need help?{" "}
          <a
            href="mailto:help@circulo.ir"
            className="auth-link underline-offset-4 transition hover:underline"
          >
            Contact support
          </a>
        </div>
      </div>
    );
  }

  const IconComponent = icon ? iconMap[icon] : null;
  const iconColor = icon ? iconColorMap[icon] : "";
  const iconBg = icon ? iconBgMap[icon] : "";

  return (
    <div className={`${inter.className} space-y-6`}>
      <div className="space-y-1 text-center">
        <h1 className="text-[32px] font-medium tracking-tight text-black">
          {title}
        </h1>
        <p
          className={`${inter.className} text-muted-foreground text-[16px] font-[380]`}
        >
          {description}
        </p>
      </div>

      <div className={`${inter.className} mt-8 space-y-8`}>
        <div className="flex w-full flex-col gap-3">
          {isExpiredError && (
            <Button
              variant="outline"
              className="w-full rounded-[10px] border-[var(--brand-primary-hex)] text-[15px] font-medium text-[var(--brand-primary-hex)] transition-colors duration-200 hover:bg-[var(--brand-primary-hex)] hover:text-white"
              onClick={() => router.push("/")}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Request New Invitation
            </Button>
          )}

          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || "default"}
              className={
                (action.variant || "default") === "default"
                  ? `${buttonClass} flex w-full items-center justify-center gap-2 rounded-[10px] border text-[15px] font-medium text-white transition-all duration-200`
                  : action.variant === "outline"
                    ? "w-full rounded-[10px] border-[var(--brand-primary-hex)] text-[15px] font-medium text-[var(--brand-primary-hex)] transition-colors duration-200 hover:bg-[var(--brand-primary-hex)] hover:text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground w-full rounded-[10px]"
              }
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
            >
              {action.loading ? (
                <>
                  <LoadingAgent />
                  {action.label}...
                </>
              ) : (
                action.label
              )}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={`${inter.className} auth-text-muted fixed right-0 bottom-0 left-0 z-50 pb-8 text-center text-[13px] leading-relaxed font-[340]`}
      >
        Need help?{" "}
        <a
          href={`mailto:${brandConfig.supportEmail}`}
          className="auth-link underline-offset-4 transition hover:underline"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
