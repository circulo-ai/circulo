import { ProviderSelectionStrategy, ProviderSelectionContext } from '@mhbdev/bdk/providers';
import { PaymentProvider } from '@mhbdev/bdk/core';
import { InMemoryPaymentProviderRegistry } from "./in-memory-registry";

export class DefaultProviderSelectionStrategy extends ProviderSelectionStrategy {
  constructor(private registry: InMemoryPaymentProviderRegistry) { super(); }
  async selectProvider(context: ProviderSelectionContext): Promise<PaymentProvider> {
    // TODO: use sizpay for Iranian users and stripe provider for other users
    return this.registry.getDefaultProvider();
  }
}