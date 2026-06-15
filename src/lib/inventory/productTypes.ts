import type { InventoryItemType, SealedProductType } from '../../types/domain';

export const inventoryItemTypeLabels: Record<InventoryItemType, string> = {
  single_card: 'Single card',
  sealed_product: 'Sealed product',
  mystery_pack: 'Mystery pack'
};

export const sealedProductTypeLabels: Record<SealedProductType, string> = {
  booster_box: 'Booster box',
  booster_pack: 'Booster pack',
  starter_deck: 'Starter deck',
  special_promo_set: 'Special promo set',
  collection: 'Collection / gift set',
  other_sealed: 'Other sealed product'
};

export const sealedProductTypeOptions = Object.entries(sealedProductTypeLabels).map(([value, label]) => ({
  value,
  label
}));
