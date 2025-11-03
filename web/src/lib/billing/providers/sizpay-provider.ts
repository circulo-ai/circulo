import { PaymentProvider, PaymentStatus, type Money, type PaymentOptions, type ProviderPaymentResult, type ProviderRefundResult, type ProviderMethodResult } from "@mhbdev/bdk";
import { SizPayClient } from "@/lib/sizpay/client";
import type { SizPayConfirmResponse } from "@/lib/sizpay/types";

/**
 * BDK PaymentProvider implementation for SizPay (redirect-based checkout).
 *
 * createPayment: initializes a SizPay transaction and returns a token treated as providerTransactionId.
 * capturePayment: confirms a token with SizPay and returns SUCCEEDED on success.
 * refundPayment: not supported via API — throws PaymentProviderError.
 * createPaymentMethod/removePaymentMethod: not applicable for SizPay — unsupported.
 */
export class SizpayProvider implements PaymentProvider {
  public readonly providerId = "sizpay";
  private readonly client: SizPayClient;

  constructor(client: SizPayClient) {
    this.client = client;
  }

  async createPayment(
    amount: Money,
    _paymentMethod: any,
    options?: PaymentOptions,
  ): Promise<ProviderPaymentResult> {
    const amountTomans = Math.round(amount.amount); // SizPay expects integer Tomans
    const callbackUrl = options?.metadata?.callbackUrl as string | undefined;
    if (!callbackUrl) {
      throw new Error("SizPay createPayment requires metadata.callbackUrl");
    }

    const resp = await this.client.createTransaction({
      amount: amountTomans,
      callbackUrl,
      customExtraInfo: options?.metadata ?? {},
    });

    return {
      success: true,
      providerTransactionId: resp.token, // use token as transaction identifier
      status: PaymentStatus.PENDING,
      amount,
      raw: {
        token: resp.token,
        gatewayUrl: resp.gatewayUrl,
        orderId: resp.orderId,
      },
    };
  }

  async capturePayment(providerTransactionId: string): Promise<ProviderPaymentResult> {
    const confirm: SizPayConfirmResponse = await this.client.confirm(
      providerTransactionId,
    );

    if (!confirm.success) {
      return {
        success: false,
        providerTransactionId,
        status: PaymentStatus.FAILED,
        amount: { amount: 0, currency: "IRR" },
        raw: confirm,
      };
    }

    const amt = typeof confirm.amount === "number" ? confirm.amount : 0;
    return {
      success: true,
      providerTransactionId: confirm.transNo ?? providerTransactionId,
      status: PaymentStatus.SUCCEEDED,
      amount: { amount: amt, currency: "IRR" },
      raw: confirm,
    };
  }

  async refundPayment(_providerTransactionId: string, _amount?: Money): Promise<ProviderRefundResult> {
    // SizPay typically does not support programmatic refunds; manual settlement is required.
    throw new Error("SizPay refunds are not supported via API");
  }

  async createPaymentMethod(_customerId: string, _providerMethodData: any): Promise<ProviderMethodResult> {
    // Not applicable for SizPay; payment method is handled on bank gateway.
    throw new Error("SizPay does not support stored payment methods");
  }

  async removePaymentMethod(_providerMethodId: string): Promise<void> {
    // Not applicable for SizPay.
    return;
  }

  async verifyWebhook(_payload: string, _signature: string): Promise<boolean> {
    // SizPay does not commonly use webhooks; verification is not applicable.
    return false;
  }
}

export default SizpayProvider;