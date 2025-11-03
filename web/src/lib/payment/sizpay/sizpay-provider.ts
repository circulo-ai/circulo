import fetch from 'node-fetch';
import { PaymentProvider, ProviderPaymentResult, ProviderRefundResult, ProviderMethodResult, PaymentOptions, PaymentMethod, Money, PaymentStatus } from '@mhbdev/bdk/core';
import { sizpayConfig } from './config';
import { aesEncryptBase64, hmacSha256Base64 } from "@/lib/server-utils";

const BASE_URL = 'https://rt.sizpay.ir/api/PaymentSimple';
const RESULT_SUCCESS_CODES = new Set(['0', '00']);

interface GetTokenRequest {
  MerchantID: string;
  TerminalID: string;
  Amount: number; // Tomans
  DocDate: string;
  OrderID: string;
  ReturnURL: string;
  ExtraInf: string;
  InvoiceNo: string;
  AppExtraInf?: string; // JSON
  UserName: string; // base64 key
  Password: string; // base64 iv
  SignData: string;
}

interface ConfirmRequest {
  MerchantID: string;
  TerminalID: string;
  Token: string;
  SignData: string;
}

export class SizPayProvider extends PaymentProvider {
  readonly providerId = 'sizpay';

  private async httpPostJson(path: string, body: Record<string, any>): Promise<{ status: number; json: any }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  }

  async createPayment(amount: Money, paymentMethod: PaymentMethod, options?: PaymentOptions): Promise<ProviderPaymentResult> {
    const orderId = Math.floor(10000000 + Math.random() * 89999999).toString();
    const returnUrl = options?.metadata?.returnUrl || process.env.RETURN_URL || '';

    const docDate = '';
    const extraInf = '';
    const invoiceNo = '';
    const appExtraInf = JSON.stringify(options?.metadata || {});

    const plain = `${sizpayConfig.merchantId},${sizpayConfig.terminalId},${Math.floor(amount.amount)},${docDate},${orderId},${returnUrl},${extraInf},${invoiceNo}`;
    const signed = hmacSha256Base64(plain, sizpayConfig.signKey);
    const signData = aesEncryptBase64(`${plain},${signed}`, sizpayConfig.usernameBase64, sizpayConfig.passwordBase64);

    const req: GetTokenRequest = {
      MerchantID: sizpayConfig.merchantId,
      TerminalID: sizpayConfig.terminalId,
      Amount: Math.floor(amount.amount),
      DocDate: docDate,
      OrderID: orderId,
      ReturnURL: returnUrl,
      ExtraInf: extraInf,
      InvoiceNo: invoiceNo,
      AppExtraInf: appExtraInf,
      UserName: sizpayConfig.usernameBase64,
      Password: sizpayConfig.passwordBase64,
      SignData: signData
    };

    const { status, json } = await this.httpPostJson('/GetTokenSimple', req);
    if (status !== 200) {
      return {
        success: false,
        providerTransactionId: '',
        status: PaymentStatus.FAILED,
        amount,
        failureReason: `HTTP ${status}`,
        raw: json
      };
    }
    const resCode = String(json?.ResCod ?? '');
    if (!RESULT_SUCCESS_CODES.has(resCode)) {
      return {
        success: false,
        providerTransactionId: '',
        status: PaymentStatus.FAILED,
        amount,
        failureReason: json?.Message || 'GetToken failed',
        raw: json
      };
    }
    const token = String(json.Token);
    const redirectUrl = `https://rt.sizpay.ir/Route/Payment?token=${token}`;
    return {
      success: true,
      providerTransactionId: token,
      status: PaymentStatus.PENDING,
      amount,
      raw: { token, redirectUrl, orderId }
    };
  }

  async capturePayment(providerTransactionId: string): Promise<ProviderPaymentResult> {
    const plain = `${sizpayConfig.merchantId},${sizpayConfig.terminalId},${providerTransactionId}`;
    const signed = hmacSha256Base64(plain, sizpayConfig.signKey);
    const signData = aesEncryptBase64(`${plain},${signed}`, sizpayConfig.usernameBase64, sizpayConfig.passwordBase64);
    const req: ConfirmRequest = {
      MerchantID: sizpayConfig.merchantId,
      TerminalID: sizpayConfig.terminalId,
      Token: providerTransactionId,
      SignData: signData
    };
    const { status, json } = await this.httpPostJson('/ConfirmSimple', req);
    if (status !== 200) {
      return {
        success: false,
        providerTransactionId,
        status: PaymentStatus.FAILED,
        amount: { amount: Number(json?.Amount ?? 0), currency: String(json?.Currency ?? 'IRT') },
        failureReason: `HTTP ${status}`,
        raw: json
      };
    }
    const resCode = String(json?.ResCod ?? '');
    const ok = RESULT_SUCCESS_CODES.has(resCode);
    const amt = Number(json?.Amount ?? 0);
    return {
      success: ok,
      providerTransactionId,
      status: ok ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
      amount: { amount: amt, currency: 'IRT' },
      failureReason: ok ? undefined : (json?.Message || 'Confirm failed'),
      raw: json
    };
  }

  async refundPayment(providerTransactionId: string, amount?: Money): Promise<ProviderRefundResult> {
    // Not supported via SizPay REST API (as per provided implementation)
    throw new Error('Refund not supported by SizPay REST');
  }

  async createPaymentMethod(customerId: string, providerMethodData: any): Promise<ProviderMethodResult> {
    // SizPay does not expose customer-storable methods in REST; return a placeholder
    return {
      providerMethodId: 'sizpay_redirect',
      type: 'gateway',
      raw: { customerId }
    };
  }

  async removePaymentMethod(providerMethodId: string): Promise<void> {
    // No-op for SizPay REST
  }

  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    // SizPay REST flow does not document webhooks; always false
    return false;
  }
}