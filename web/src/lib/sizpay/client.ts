import crypto from "crypto";
import {
  CreateTransactionParams,
  CreateTransactionResult,
  SIZPAY_CONSTANTS,
  SizPayApiMode,
  SizPayConfig,
  SizPayConfirmRequest,
  SizPayConfirmResponse,
  SizPayTokenRequest,
  SizPayTokenResponse,
} from "./types";

export class SizPayClient {
  private config: Required<SizPayConfig>;

  constructor(config: SizPayConfig) {
    this.config = {
      ...config,
      apiMode: config.apiMode || SizPayApiMode.REST,
    };
    this.validateCryptoConfig();
  }

  /**
   * Create a payment transaction
   */
  async createTransaction(
    params: CreateTransactionParams,
  ): Promise<CreateTransactionResult> {
    const orderId = params.orderId || this.generateOrderId();

    const data: SizPayTokenRequest = {
      MerchantID: this.config.merchantId,
      TerminalID: this.config.terminalId,
      Amount: params.amount,
      DocDate: "",
      OrderID: orderId,
      ReturnURL: params.callbackUrl,
      ExtraInf: "",
      InvoiceNo: "",
      AppExtraInf: JSON.stringify(params.customExtraInfo || {}),
      UserName: this.config.username,
      Password: this.config.password,
    };

    const result =
      this.config.apiMode === SizPayApiMode.SOAP
        ? await this.getTokenSoap(data)
        : await this.getTokenRest(data);

    if (!result.success || !result.token) {
      throw new Error(
        `Failed to create transaction: ${result.message || "Unknown error"}`,
      );
    }

    return {
      token: result.token,
      gatewayUrl: this.getRedirectUrl(result.token),
      orderId,
    };
  }

  /**
   * Confirm a payment transaction
   */
  async confirm(token: string): Promise<SizPayConfirmResponse> {
    const plainText = `${this.config.merchantId},${this.config.terminalId},${token}`;
    const signData = this.aesEncrypt(
      `${plainText},${this.sha256Sign(plainText)}`,
    );

    const data: SizPayConfirmRequest = {
      MerchantID: this.config.merchantId,
      TerminalID: this.config.terminalId,
      Token: token,
      SignData: signData,
    };

    const response =
      this.config.apiMode === SizPayApiMode.SOAP
        ? await this.confirmSoap(data)
        : await this.confirmRest(data);

    if (!response.success) {
      throw new Error(
        `Payment confirmation failed: ${response.message || "Unknown error"}`,
      );
    }

    return response;
  }

  /**
   * Get payment gateway redirect URL
   */
  getRedirectUrl(token: string): string {
    return `${SIZPAY_CONSTANTS.BASE_URL_REST}/Route/Payment?token=${token}`;
  }

  /**
   * Get token via REST API
   */
  private async getTokenRest(
    data: SizPayTokenRequest,
  ): Promise<SizPayTokenResponse> {
    const plainText = `${data.MerchantID},${data.TerminalID},${data.Amount},${data.DocDate},${data.OrderID},${data.ReturnURL},${data.ExtraInf},${data.InvoiceNo}`;

    const requestData = {
      ...data,
      SignData: this.aesEncrypt(`${plainText},${this.sha256Sign(plainText)}`),
    };

    try {
      const response = await this.httpPost(
        `${SIZPAY_CONSTANTS.BASE_URL_REST}/api/Payment/GetToken`,
        requestData,
      );

      if (response.success && response.data) {
        const result = JSON.parse(response.data);

        if (SIZPAY_CONSTANTS.SUCCESS_CODES.includes(result.ResCod)) {
          return {
            success: true,
            token: result.Token,
            message: result.Message,
            resCode: result.ResCod,
          };
        }

        return {
          success: false,
          message: result.Message || "Unknown error",
          resCode: result.ResCod,
        };
      }

      return {
        success: false,
        message: response.message || "Invalid response from payment gateway",
      };
    } catch (error) {
      console.error("SizPay getTokenRest error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get token via SOAP API (for compatibility)
   */
  private async getTokenSoap(
    data: SizPayTokenRequest,
  ): Promise<SizPayTokenResponse> {
    // Note: Node.js doesn't have native SOAP client
    // You'll need to use a library like 'soap' npm package
    throw new Error(
      "SOAP mode not implemented. Please use REST mode or implement with soap package.",
    );
  }

  /**
   * Confirm payment via REST API
   */
  private async confirmRest(
    data: SizPayConfirmRequest,
  ): Promise<SizPayConfirmResponse> {
    try {
      const response = await this.httpPost(
        `${SIZPAY_CONSTANTS.BASE_URL_REST}/api/Payment/Confirm`,
        data,
      );

      if (response.success && response.data) {
        const result = JSON.parse(response.data);

        if (SIZPAY_CONSTANTS.SUCCESS_CODES.includes(result.ResCod)) {
          return {
            success: true,
            message: result.Message,
            resCode: result.ResCod,
            merchantId: result.MerchantID,
            terminalId: result.TerminalID,
            orderId: result.OrderID,
            transNo: result.TransNo,
            refNo: result.RefNo,
            traceNo: result.TraceNo,
            amount: result.Amount,
            cardNo: result.CardNo,
            transDate: result.TransDate,
            invoiceNo: result.InvoiceNo,
            extraInfo: result.ExtraInf,
            appExtraInfo: result.AppExtraInf || "",
            token: result.Token,
          };
        }

        return {
          success: false,
          message: result.Message || "Confirmation failed",
          resCode: result.ResCod,
        };
      }

      return {
        success: false,
        message: response.message || "Invalid response from payment gateway",
      };
    } catch (error) {
      console.error("SizPay confirmRest error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Confirm payment via SOAP API (for compatibility)
   */
  private async confirmSoap(
    data: SizPayConfirmRequest,
  ): Promise<SizPayConfirmResponse> {
    throw new Error(
      "SOAP mode not implemented. Please use REST mode or implement with soap package.",
    );
  }

  /**
   * AES-256-CBC encryption
   */
  private aesEncrypt(data: string): string {
    const key = Buffer.from(this.config.username, "base64");
    const iv = Buffer.from(this.config.password, "base64");

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    return encrypted;
  }

  /**
   * Validate crypto config (key/iv) length requirements
   */
  private validateCryptoConfig() {
    const key = Buffer.from(this.config.username, "base64");
    const iv = Buffer.from(this.config.password, "base64");
    if (key.length !== 32 || iv.length !== 16) {
      const msg = `SizPay crypto config invalid: expected base64-encoded key (username) to be 32 bytes and IV (password) to be 16 bytes. Got key=${key.length} bytes, iv=${iv.length} bytes.`;
      throw new Error(msg);
    }
  }

  /**
   * SHA-256 HMAC signature
   */
  private sha256Sign(data: string): string {
    const hmac = crypto.createHmac("sha256", this.config.signKey);
    hmac.update(data);
    return hmac.digest("base64");
  }

  /**
   * HTTP POST request
   */
  private async httpPost(
    url: string,
    data: Record<string, any>,
  ): Promise<{ success: boolean; data?: string; message?: string }> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(SIZPAY_CONSTANTS.TIMEOUT),
      });

      if (!response.ok) {
        return {
          success: false,
          message: `HTTP Error: ${response.status}`,
        };
      }

      const responseData = await response.text();
      return {
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("HTTP POST error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  /**
   * Generate random order ID
   */
  private generateOrderId(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }
}

// Singleton instance for convenience
let sizpayClient: SizPayClient | null = null;

export function getSizPayClient(config?: SizPayConfig): SizPayClient {
  if (!sizpayClient && config) {
    sizpayClient = new SizPayClient(config);
  }

  if (!sizpayClient) {
    throw new Error("SizPay client not initialized. Please provide config.");
  }

  return sizpayClient;
}

export function initializeSizPay(config: SizPayConfig): SizPayClient {
  sizpayClient = new SizPayClient(config);
  return sizpayClient;
}
