// app/wallet/page.tsx
import {
  DepositForm,
  PaymentHistory,
  PaymentStatus,
} from "@/components/payments/deposit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import { wallet } from "@/db/schema";
import { useSession } from "@/providers/session-provider";
import { eq } from "drizzle-orm";
import { CreditCard, History, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function getWalletBalance(userId: string) {
  const userWallet = await db.query.wallet.findFirst({
    where: eq(wallet.userId, userId),
  });

  return userWallet?.balance || "0.00";
}

export default async function WalletPage() {
  const { data: session } = useSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const balance = await getWalletBalance(session.user.id);

  const formatNumber = (num: string) => {
    return parseFloat(num).toLocaleString("fa-IR");
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">کیف پول</h1>
        <p className="text-muted-foreground">مدیریت موجودی و تراکنش‌های مالی</p>
      </div>

      <Suspense fallback={null}>
        <PaymentStatus />
      </Suspense>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            موجودی حساب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-primary text-4xl font-bold">
            {formatNumber(balance)} تومان
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="deposit" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="deposit" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            واریز به کیف پول
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            تاریخچه پرداخت‌ها
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposit">
          <Card>
            <CardHeader>
              <CardTitle>واریز وجه</CardTitle>
            </CardHeader>
            <CardContent>
              <DepositForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <PaymentHistory />
        </TabsContent>
      </Tabs>

      <Card className="mt-8 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <h3 className="mb-2 font-semibold">نکات مهم:</h3>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            <li>حداقل مبلغ واریز ۱۰,۰۰۰ تومان است</li>
            <li>پرداخت از طریق درگاه امن سیزپی انجام می‌شود</li>
            <li>موجودی پس از پرداخت موفق بلافاصله به حساب شما اضافه می‌شود</li>
            <li>در صورت بروز مشکل با پشتیبانی تماس بگیرید</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
