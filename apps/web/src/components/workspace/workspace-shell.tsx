"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ArrowLeft01Icon,
  BookOpen01Icon,
  BrainIcon,
  Building01Icon,
  CalendarClockIcon,
  CreditCardIcon,
  Home01Icon,
  Robot01Icon,
  ServerStack01Icon,
  Settings01Icon,
  ShieldUserIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";

export type WorkspaceSection =
  | "overview"
  | "members"
  | "teams"
  | "permissions"
  | "agents"
  | "knowledge"
  | "memory"
  | "tools"
  | "plugins"
  | "automation"
  | "account"
  | "billing";

type NavigationItem = {
  id: WorkspaceSection;
  label: string;
  href: string;
  icon: typeof Home01Icon;
};

const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Workspace",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: "/workspace?section=overview",
        icon: Home01Icon,
      },
      {
        id: "members",
        label: "Members & roles",
        href: "/workspace?section=members",
        icon: UserGroupIcon,
      },
      {
        id: "teams",
        label: "Teams",
        href: "/workspace?section=teams",
        icon: UserGroupIcon,
      },
      {
        id: "permissions",
        label: "Permissions",
        href: "/workspace?section=permissions",
        icon: ShieldUserIcon,
      },
    ],
  },
  {
    label: "Resources",
    items: [
      { id: "agents", label: "Agents", href: "/agents", icon: Robot01Icon },
      {
        id: "knowledge",
        label: "Knowledge",
        href: "/knowledge",
        icon: BookOpen01Icon,
      },
      { id: "memory", label: "Memory", href: "/memory", icon: BrainIcon },
      {
        id: "tools",
        label: "Tools & MCP",
        href: "/workspace?section=tools",
        icon: ServerStack01Icon,
      },
      {
        id: "plugins",
        label: "Plugins",
        href: "/plugins",
        icon: ServerStack01Icon,
      },
      {
        id: "automation",
        label: "Automation",
        href: "/automation",
        icon: CalendarClockIcon,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        id: "account",
        label: "Account settings",
        href: "/workspace?section=account",
        icon: Settings01Icon,
      },
      {
        id: "billing",
        label: "Billing",
        href: "/pricing",
        icon: CreditCardIcon,
      },
    ],
  },
];

export function WorkspaceShell({
  activeSection,
  title,
  description,
  actions,
  children,
}: {
  activeSection: WorkspaceSection;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 pb-5">
          <Button asChild size="sm" variant="ghost">
            <Link href="/chat">
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                data-icon="inline-start"
                strokeWidth={2}
              />
              Back to chat
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Building01Icon} strokeWidth={2} />
            Workspace
          </div>
        </header>
        <Separator />
        <div className="grid min-h-0 flex-1 items-start gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6">
            <nav
              aria-label="Workspace navigation"
              className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible"
            >
              {navigation.map((group) => (
                <div
                  className="flex shrink-0 flex-col gap-1 lg:mb-4"
                  key={group.label}
                >
                  <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <Button
                      asChild
                      className={cn(
                        "justify-start gap-2",
                        activeSection === item.id &&
                          "bg-accent text-accent-foreground",
                      )}
                      key={item.id}
                      size="sm"
                      variant="ghost"
                    >
                      <Link
                        href={item.href}
                        aria-current={
                          activeSection === item.id ? "page" : undefined
                        }
                      >
                        <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
          <section className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pr-1">
            <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Workspace settings
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  {title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
              {actions}
            </div>
            <div className="pt-6">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
