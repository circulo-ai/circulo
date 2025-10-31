"use client";

import { usePlans } from "@/hooks/billing/use-plans";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState } from "react";

export type PricingTableProps = {
  onSubscribe?: (planId: string) => void;
};

export function PricingTable({ onSubscribe }: PricingTableProps) {
  const { plans, loading, error } = usePlans();
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    try {
      setSubscribing(planId);
      const res = await fetch("/api/v1/billing/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data?.gatewayUrl) {
        throw new Error(json?.error || "Failed to start subscription");
      }
      onSubscribe?.(planId);
      window.location.href = json.data.gatewayUrl as string;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Subscription error");
    } finally {
      setSubscribing(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading plans…</div>;
  }
  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <Card key={plan.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{plan.name}</span>
              <span className="text-primary text-xl">
                {new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency }).format(plan.amount)}
              </span>
            </CardTitle>
            <CardDescription>
              {plan.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-sm">
              Billed every {plan.intervalCount} {plan.interval}(s)
            </div>
            {plan.trialPeriodDays ? (
              <div className="mb-2 text-xs text-muted-foreground">Includes {plan.trialPeriodDays} day trial</div>
            ) : null}
            <Accordion type="single" collapsible>
              <AccordionItem value="features">
                <AccordionTrigger>Features</AccordionTrigger>
                <AccordionContent>
                  {Array.isArray((plan.features as any)?.list) ? (
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {((plan.features as any).list as string[]).map((f: string, idx: number) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  ) : (
                    <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(plan.features, null, 2)}</pre>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
          <CardFooter>
            <Button className="w-full" disabled={!!subscribing} onClick={() => handleSubscribe(plan.id)}>
              {subscribing === plan.id ? "Redirecting…" : "Subscribe"}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}