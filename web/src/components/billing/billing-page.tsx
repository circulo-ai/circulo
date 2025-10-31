"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingTable } from "@/components/billing/pricing-table";
import { useSubscriptions } from "@/hooks/billing/use-subscriptions";
import { useInvoices } from "@/hooks/billing/use-invoices";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function BillingPage() {
  const { subscriptions, loading: loadingSubs } = useSubscriptions();
  const { invoices, loading: loadingInvoices } = useInvoices();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Choose a plan</CardTitle>
            </CardHeader>
            <CardContent>
              <PricingTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSubs ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.plan?.name ?? s.planId}</TableCell>
                        <TableCell className="capitalize">{s.status}</TableCell>
                        <TableCell>
                          {new Date(s.currentPeriodStart).toLocaleDateString()} – {new Date(s.currentPeriodEnd).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.number}</TableCell>
                        <TableCell className="capitalize">{inv.status}</TableCell>
                        <TableCell>
                          {new Intl.NumberFormat(undefined, { style: "currency", currency: inv.totalCurrency }).format(inv.totalAmount)}
                        </TableCell>
                        <TableCell>{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}