import { getSubscriptionPlans } from "@/app/(billing)/actions/get-plans";
import { PlanFeatures } from "@/db/schema/billing";
import { generateRandomPath, Step } from "@/lib/border-walk";
import { Icon } from "@/types/icon";
import {
  Bot,
  Gauge,
  Headphones,
  LibraryBig,
  MessageSquare,
  MessageSquareText,
  ReceiptText,
  Users,
  UsersRound,
} from "lucide-react";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { PricingBackground } from "./pricing-background";
import { Spinner } from "./ui/spinner";

const starts: Step[] = [
  { x: 2, y: 0, border: "bottom", direction: "forward" },
  { x: 4, y: 11, border: "bottom", direction: "backward" },
  { x: 0, y: 6, border: "right", direction: "backward" },
  { x: 7, y: 4, border: "right", direction: "forward" },
];

const paths = starts.map((start, index) =>
  generateRandomPath({
    rows: 8,
    cols: 12,
    start,
    maxSteps: 128,
    seed: index + 3,
    avoidPerimeter: true,
    forwardBias: 0.75,
  }),
);

export function PricingSection() {
  return (
    <section id="pricing" className="main-section relative">
      <PricingBackground paths={paths} />
      <Suspense
        fallback={<Spinner className="absolute inset-0 m-auto size-4" />}
      >
        <Plans />
      </Suspense>
    </section>
  );
}

async function Plans() {
  const plans = await getCachedPlans();
  // needs refactoring, from here
  const featureTranslations: Record<keyof PlanFeatures, string> = {
    customBilling: "Custom billing",
    dedicatedSupport: "Dedicated support",
    kbSlots: "Knowledge base slots",
    maxAgents: "Max agents",
    maxChats: "Max chats",
    teamMembers: "Team members",
    maxAgentsInChat: "Max agents in chat",
    rateLimitPerMinute: "Rate limit per minute",
    maxMessagesPerDay: "Max messages per day",
  };

  const featureIcons: Record<keyof PlanFeatures, Icon> = {
    customBilling: ReceiptText,
    dedicatedSupport: Headphones,
    kbSlots: LibraryBig,
    maxAgents: Bot,
    maxChats: MessageSquare,
    teamMembers: Users,
    maxAgentsInChat: UsersRound,
    rateLimitPerMinute: Gauge,
    maxMessagesPerDay: MessageSquareText,
  };

  return (
    <div className="absolute inset-0 grid grid-cols-12 grid-rows-8 gap-0.5">
      <div className="col-span-1 row-span-1 row-start-2"></div>
      {plans.map((plan) => {
        const featureNames = Object.keys(
          plan.features ?? {},
        ) as (keyof PlanFeatures)[];
        return (
          <article
            key={plan.id}
            className="backdrop-blur-xs_ relative col-span-3 row-span-5 row-start-3 flex flex-col bg-background/75 px-12 py-8"
          >
            <h4 className="flex items-center justify-start text-3xl">
              {plan.name}
            </h4>
            <p className="text-foreground/50">{plan.description}</p>
            {/* <div className="absolute top-3 end-3 text-xs">{plan.slug}</div> */}

            <div className="mt-auto flex flex-col gap-1">
              {featureNames.map((featureName) => {
                const Icon = featureIcons[featureName];
                return (
                  <div
                    key={featureName}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-4" />
                      {featureTranslations[featureName]}
                    </div>
                    <div>{plan?.features?.[featureName] ?? "–"}</div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
  // to here
}

const getCachedPlans = unstable_cache(
  async () => getSubscriptionPlans(),
  ["plans"],
  { tags: ["plans"], revalidate: 60 * 60 * 24 },
);
