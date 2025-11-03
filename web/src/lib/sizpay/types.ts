export enum SizPayApiMode {
  SOAP = "SOAP",
  REST = "REST",
}

export enum SizPayTransactionStatus {
  PENDING = "pending",
  AWAITING_PAYMENT = "awaiting_payment",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface SizPayConfig {
  merchantId: string;
  terminalId: string;
  username: string;
  password: string;
  signKey: string;
  apiMode?: SizPayApiMode;
}

export interface SizPayTokenRequest {
  MerchantID: string;
  TerminalID: string;
  Amount: number;
  DocDate: string;
  OrderID: string;
  ReturnURL: string;
  ExtraInf: string;
  InvoiceNo: string;
  AppExtraInf: string;
  UserName: string;
  Password: string;
}

export interface SizPayTokenResponse {
  success: boolean;
  token?: string;
  message?: string;
  resCode?: string;
}

export interface SizPayConfirmRequest {
  MerchantID: string;
  TerminalID: string;
  Token: string;
  SignData: string;
}

export interface SizPayConfirmResponse {
  success: boolean;
  message?: string;
  resCode?: string;
  merchantId?: string;
  terminalId?: string;
  orderId?: string;
  transNo?: string;
  refNo?: string;
  traceNo?: string;
  amount?: number;
  cardNo?: string;
  transDate?: string;
  invoiceNo?: string;
  extraInfo?: string;
  appExtraInfo?: string;
  token?: string;
}

export interface CreateTransactionParams {
  amount: number; // in Tomans
  callbackUrl: string;
  customExtraInfo?: Record<string, any>;
  orderId?: string;
}

export interface CreateTransactionResult {
  token: string;
  gatewayUrl: string;
  orderId: string;
}

export const SIZPAY_CONSTANTS = {
  SUCCESS_CODES: ["0", "00"],
  BASE_URL_REST: "https://rt.sizpay.ir",
  BASE_URL_SOAP: "https://rt.sizpay.ir/KimiaIPGRouteService.asmx",
  TIMEOUT: 30000,
} as const;
