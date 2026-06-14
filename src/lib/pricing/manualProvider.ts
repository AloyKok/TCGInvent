import type { InventoryItem } from '../../types/domain';

export interface PricingProvider {
  getMarketPrice(item: InventoryItem): Promise<number | null>;
}

export const manualPricingProvider: PricingProvider = {
  async getMarketPrice() {
    return null;
  }
};
