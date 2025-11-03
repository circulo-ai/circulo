import { env } from "@/lib/env";

export interface SizPayConfig {
  merchantId: string;
  terminalId: string;
  usernameBase64: string;
  passwordBase64: string;
  signKey: string;
}

export const sizpayConfig: SizPayConfig = {
  merchantId: env.SIZPAY_MERCHANT_ID || '',
  terminalId: env.SIZPAY_TERMINAL_ID || '',
  usernameBase64: env.SIZPAY_USERNAME_B64 || '',
  passwordBase64: env.SIZPAY_PASSWORD_B64 || '',
  signKey: env.SIZPAY_SIGN_KEY || ''
};

export const returnUrl = env.SIZPAY_RETURN_URL || 'http://localhost:3000/api/sizpay/callback';
export const redisUrl = env.REDIS_URL || '';