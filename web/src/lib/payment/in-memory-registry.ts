import { PaymentProvider } from '@mhbdev/bdk/core';
import { PaymentProviderRegistry } from '@mhbdev/bdk/providers';
import { SizPayProvider } from "@/lib/payment/sizpay/sizpay-provider";

export class InMemoryPaymentProviderRegistry extends PaymentProviderRegistry {
  private providers = new Map<string, PaymentProvider>();
  private defaultProviderId: string | null = null;

  constructor() {
    super();
    this.register(new SizPayProvider())
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.providerId, provider);
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.providerId;
    }
  }

  getProvider(providerId: string): PaymentProvider | undefined {
    return this.providers.get(providerId);
  }

  getDefaultProvider(): PaymentProvider {
    if (!this.defaultProviderId) throw new Error('No default provider set');
    const p = this.providers.get(this.defaultProviderId);
    if (!p) throw new Error('Default provider missing');
    return p;
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) throw new Error(`Unknown provider: ${providerId}`);
    this.defaultProviderId = providerId;
  }

  listProviders(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }
}
