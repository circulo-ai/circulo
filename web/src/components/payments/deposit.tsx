"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayment } from "@/hooks/payments/use-payment";
import { usePaymentList } from "@/hooks/payments/use-payments-list";
import { useState } from "react";

const PRESET_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];

export function DepositForm() {
  const [amount, setAmount] = useState<number>(100000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const { loading, error, createPayment, redirectToGateway } = usePayment();

  const handlePresetClick = (value: number) => {
    setAmount(value);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    const numValue = parseInt(value.replace(/,/g, ""));
    if (!isNaN(numValue)) {
      setAmount(numValue);
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString("fa-IR");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (amount < 10000) {
      alert("حداقل مبلغ واریزی ۱۰,۰۰۰ تومان است");
      return;
    }

    const result = await createPayment({
      amount,
      metadata: {
        source: "wallet_deposit",
      },
    });

    if (result) {
      redirectToGateway(result.gatewayUrl);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="amount" className="text-lg font-semibold">
          مبلغ واریز
        </Label>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRESET_AMOUNTS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={amount === value ? "default" : "outline"}
              onClick={() => handlePresetClick(value)}
              className="h-12"
            >
              {formatNumber(value)} تومان
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="custom-amount">مبلغ دلخواه</Label>
        <Input
          id="custom-amount"
          type="text"
          placeholder="مثال: ۱۵۰,۰۰۰"
          value={customAmount}
          onChange={(e) => handleCustomAmountChange(e.target.value)}
          className="mt-2 text-right"
        />
        <p className="text-muted-foreground mt-2 text-sm">
          حداقل مبلغ: ۱۰,۰۰۰ تومان
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="border-t pt-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-lg">مبلغ قابل پرداخت:</span>
          <span className="text-2xl font-bold">
            {formatNumber(amount)} تومان
          </span>
        </div>

        <Button
          type="submit"
          disabled={loading || amount < 10000}
          className="h-12 w-full text-lg"
        >
          {loading ? "در حال انتقال به درگاه..." : "پرداخت"}
        </Button>
      </div>
    </form>
  );
}

// components/payment/payment-status.tsx
("use client");

import { AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function PaymentStatus() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get("payment");
  const amount = searchParams.get("amount");
  const message = searchParams.get("message");

  useEffect(() => {
    // Auto-clear URL params after 5 seconds
    if (status) {
      const timer = setTimeout(() => {
        router.push("/wallet");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  if (!status) return null;

  const formatNumber = (num: string | number) => {
    const n = typeof num === "string" ? parseFloat(num) : num;
    return n.toLocaleString("fa-IR");
  };

  if (status === "success") {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <AlertTitle className="text-green-800">پرداخت موفق</AlertTitle>
        <AlertDescription className="text-green-700">
          {amount
            ? `مبلغ ${formatNumber(amount)} تومان با موفقیت به کیف پول شما اضافه شد.`
            : "پرداخت شما با موفقیت انجام شد."}
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "cancelled") {
    return (
      <Alert className="border-yellow-200 bg-yellow-50">
        <AlertCircle className="h-5 w-5 text-yellow-600" />
        <AlertTitle className="text-yellow-800">پرداخت لغو شد</AlertTitle>
        <AlertDescription className="text-yellow-700">
          پرداخت توسط شما لغو شد. در صورت تمایل می‌توانید مجدداً تلاش کنید.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "failed" || status === "error") {
    return (
      <Alert variant="destructive">
        <XCircle className="h-5 w-5" />
        <AlertTitle>پرداخت ناموفق</AlertTitle>
        <AlertDescription>
          {message ? decodeURIComponent(message) : "پرداخت با خطا مواجه شد."}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

const statusColors = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  awaiting_payment: "bg-blue-100 text-blue-800",
};

const statusLabels = {
  completed: "تکمیل شده",
  pending: "در انتظار",
  failed: "ناموفق",
  cancelled: "لغو شده",
  awaiting_payment: "در انتظار پرداخت",
};

export function PaymentHistory() {
  const { payments, loading, error } = usePaymentList(20);

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatNumber = (num: string | number) => {
    const n = typeof num === "string" ? parseFloat(num) : num;
    return n.toLocaleString("fa-IR");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            تاکنون پرداختی انجام نشده است.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => (
        <Card key={payment.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-lg font-semibold">
                  {formatNumber(payment.amount)} تومان
                </p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(payment.createdAt)}
                </p>
                {payment.cardNumber && (
                  <p className="text-muted-foreground text-xs">
                    کارت: **** {payment.cardNumber}
                  </p>
                )}
              </div>
              <Badge
                className={
                  statusColors[payment.status as keyof typeof statusColors]
                }
              >
                {statusLabels[payment.status as keyof typeof statusLabels]}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
