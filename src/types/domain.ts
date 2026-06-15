export type MemberRole = 'owner' | 'admin';
export type CardLanguage = 'EN' | 'JP' | 'OTHER';
export type CardRarity = 'C' | 'UC' | 'R' | 'SR' | 'SEC' | 'L' | 'P' | 'TR' | 'SP';
export type CardArt = 'Base' | 'Parallel' | 'Manga';
export type CardCategory = 'Character' | 'Leader' | 'Event' | 'Stage' | 'DON';
export type InventoryItemType = 'single_card' | 'sealed_product' | 'mystery_pack';
export type SealedProductType = 'booster_box' | 'booster_pack' | 'starter_deck' | 'special_promo_set' | 'collection' | 'other_sealed';
export type InventoryStatus = 'in_stock' | 'sold_out' | 'reserved';
export type PaymentMethod = 'cash' | 'card' | 'other';
export type TransactionStatus = 'completed' | 'voided';

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  displayName?: string | null;
  role: MemberRole;
  createdAt: string;
  organization?: Organization;
}

export interface InventoryItem {
  id: string;
  orgId: string;
  itemNumber: string;
  itemType: InventoryItemType;
  productCategory?: SealedProductType | null;
  itemName: string;
  cardNumber?: string | null;
  setName?: string | null;
  rarity?: CardRarity | null;
  art?: CardArt | null;
  language: CardLanguage;
  category?: CardCategory | null;
  condition: string;
  gradeCompany?: string | null;
  grade?: string | null;
  quantity: number;
  costBasis?: number | null;
  askingPrice: number;
  marketPrice?: number | null;
  marketPriceUpdatedAt?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  status: InventoryStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleLineItem {
  inventoryItemId: string;
  itemNameSnapshot: string;
  itemTypeSnapshot: InventoryItemType;
  productCategorySnapshot?: SealedProductType | null;
  itemNumberSnapshot: string;
  raritySnapshot?: CardRarity | null;
  artSnapshot?: CardArt | null;
  categorySnapshot?: CardCategory | null;
  conditionSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Transaction {
  id: string;
  orgId: string;
  createdAt: string;
  createdBy: string;
  eventId?: string | null;
  lineItems: SaleLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  notes?: string | null;
  clientRef?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
}

export interface ShowEvent {
  id: string;
  orgId: string;
  name: string;
  startDate: string;
  endDate: string;
  location?: string | null;
}

export interface Settings {
  orgId: string;
  currency: string;
  defaultCondition: string;
  defaultLanguage: CardLanguage;
  activeEventId?: string | null;
  pricingApiKey?: string | null;
  labelSheetPreset: string;
}

export interface CartLine {
  item: InventoryItem;
  quantity: number;
}

export interface QueuedSale {
  id: string;
  orgId: string;
  cart: Array<{ inventoryItemId: string; quantity: number }>;
  discount: number;
  paymentMethod: PaymentMethod;
  eventId?: string | null;
  clientRef: string;
  notes?: string | null;
  createdAt: string;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface InventoryFilters {
  search: string;
  itemType: string;
  setName: string;
  rarity: string;
  art: string;
  category: string;
  language: string;
  condition: string;
  status: string;
  lowStockOnly: boolean;
}
