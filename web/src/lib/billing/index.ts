import { PaymentProvider } from "./abstraction/payment-provider";
import { PaymentProviderName } from "./abstraction/types";
import { ChangellyProvider } from "./providers/changelly";

export const paymentProviders: Record<PaymentProviderName, PaymentProvider> = {
  changelly: new ChangellyProvider(
    process.env.CHANGELLY_API_KEY as string,
    process.env.CHANGELLY_API_SECRET as string,
    process.env.CHANGELLY_CALLBACK_PUBLIC_KEY as string,
  ),
};

export function getProvider(name: PaymentProviderName): PaymentProvider {
  const provider = paymentProviders[name];
  if (!provider) {
    throw new Error(`Payment provider "${name}" not found`);
  }
  return provider;
}
