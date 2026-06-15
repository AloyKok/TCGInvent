import type {
  InventoryFilters,
  InventoryItem,
  InventoryItemType,
  Membership,
  Organization,
  QueuedSale,
  Settings,
  ShowEvent,
  Transaction
} from '../../types/domain';
import type { InventoryInput } from '../supabase/api';
import { getLocalDateInputValue } from '../events/dateRange';

const STORAGE_KEY = 'cardpulse-local-database-v4';
export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_ORG_ID = '00000000-0000-4000-8000-000000000002';

export interface LocalInvitation {
  id: string;
  orgId: string;
  email: string;
  role: 'owner' | 'admin';
  token: string;
  createdBy: string;
  createdAt: string;
}

interface LocalDatabase {
  version: 1;
  organization: Organization;
  memberships: Membership[];
  inventory: InventoryItem[];
  transactions: Transaction[];
  events: ShowEvent[];
  settings: Settings;
  invitations: LocalInvitation[];
}

export function getLocalDatabase(): LocalDatabase {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LocalDatabase;
      let migrated = false;
      parsed.events = parsed.events.map((event) => {
        const legacyEvent = event as ShowEvent & { date?: string };
        if (legacyEvent.startDate && legacyEvent.endDate) return event;
        const fallbackDate = legacyEvent.date || getLocalDateInputValue();
        const rest = { ...legacyEvent };
        delete rest.date;
        migrated = true;
        return { ...rest, startDate: fallbackDate, endDate: fallbackDate };
      });
      parsed.inventory = parsed.inventory.map((item) => {
        const legacyItem = item as InventoryItem & { cardName?: string };
        if (legacyItem.itemType && legacyItem.itemName) {
          migrated = addInventoryDefaults(legacyItem) || migrated;
          return legacyItem;
        }
        const rest = { ...legacyItem };
        delete rest.cardName;
        migrated = true;
        const next: InventoryItem = {
          ...rest,
          itemType: 'single_card' as const,
          productCategory: null,
          itemName: legacyItem.cardName || 'Unnamed item'
        };
        addInventoryDefaults(next);
        return next;
      });
      parsed.transactions = parsed.transactions.map((transaction) => ({
        ...transaction,
        lineItems: transaction.lineItems.map((line) => {
          const legacyLine = line as typeof line & { cardNameSnapshot?: string; unitCost?: number; lineProfit?: number; costUnknown?: boolean };
          if (legacyLine.itemNameSnapshot && legacyLine.unitCost !== undefined && legacyLine.lineProfit !== undefined) return line;
          const rest = { ...legacyLine };
          delete rest.cardNameSnapshot;
          migrated = true;
          return {
            ...rest,
            itemNameSnapshot: legacyLine.cardNameSnapshot || 'Unnamed item',
            itemTypeSnapshot: 'single_card' as const,
            productCategorySnapshot: null,
            unitCost: legacyLine.unitCost ?? 0,
            lineProfit: legacyLine.lineProfit ?? 0,
            costUnknown: legacyLine.costUnknown ?? true
          };
        })
      }));
      parsed.transactions = parsed.transactions.map((transaction) => {
        const legacyTransaction = transaction as Transaction & { costTotal?: number; grossProfit?: number; costUnknown?: boolean };
        if (
          legacyTransaction.costTotal !== undefined &&
          legacyTransaction.grossProfit !== undefined &&
          legacyTransaction.costUnknown !== undefined
        ) return legacyTransaction;
        migrated = true;
        return {
          ...legacyTransaction,
          costTotal: legacyTransaction.costTotal ?? 0,
          grossProfit: legacyTransaction.grossProfit ?? 0,
          costUnknown: legacyTransaction.costUnknown ?? true
        };
      });
      if (!parsed.settings.currencySymbol) {
        parsed.settings.currencySymbol = 'S$';
        migrated = true;
      }
      if (!parsed.settings.agingThresholdDays) {
        parsed.settings.agingThresholdDays = 60;
        migrated = true;
      }
      if (migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const seeded = createSeedDatabase();
  writeDatabase(seeded);
  return seeded;
}

export function resetLocalDatabase() {
  const seeded = createSeedDatabase();
  writeDatabase(seeded);
  return seeded;
}

export function getLocalMemberships() {
  return getLocalDatabase().memberships.map((membership) => ({
    ...membership,
    organization: getLocalDatabase().organization
  }));
}

export function getLocalInventory(filters?: Partial<InventoryFilters>) {
  let rows = [...getLocalDatabase().inventory].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (filters?.status) rows = rows.filter((item) => item.status === filters.status);
  if (filters?.itemType) rows = rows.filter((item) => item.itemType === filters.itemType);
  if (filters?.setName) rows = rows.filter((item) => item.setName?.toLowerCase().includes(filters.setName!.toLowerCase()));
  if (filters?.rarity) rows = rows.filter((item) => item.rarity === filters.rarity);
  if (filters?.art) rows = rows.filter((item) => item.art === filters.art);
  if (filters?.category) rows = rows.filter((item) => item.category === filters.category);
  if (filters?.language) rows = rows.filter((item) => item.language === filters.language);
  if (filters?.condition) rows = rows.filter((item) => item.condition === filters.condition);
  if (filters?.lowStockOnly) rows = rows.filter((item) => item.quantity > 0 && item.quantity <= 2);

  const search = filters?.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter((item) =>
      [item.itemName, item.setName, item.cardNumber, item.itemNumber, item.itemType, item.productCategory, item.rarity, item.art, item.category, item.condition]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }
  return rows;
}

export function saveLocalInventoryItem(input: InventoryInput, itemId?: string) {
  const db = getLocalDatabase();
  const clean = normalizeInput(input);
  const now = new Date().toISOString();
  const reference = clean.itemType === 'single_card'
    ? clean.cardNumber || ''
    : clean.itemType === 'sealed_product'
      ? clean.productCategory || 'other_sealed'
      : 'pack';
  const requestedItemNumber = clean.autoGenerateItemNumber
    ? generateLocalItemNumber(clean.itemType, reference, clean.condition, db.inventory, itemId)
    : clean.itemNumber;

  if (!requestedItemNumber) throw new Error('Item number is required when auto-generation is off');

  const duplicate = db.inventory.find((item) =>
    item.itemNumber.toUpperCase() === requestedItemNumber.toUpperCase() && item.id !== itemId
  );
  if (duplicate) {
    throw new Error(`Item number ${requestedItemNumber} is already recorded for ${duplicate.itemName}`);
  }

  if (itemId) {
    const index = db.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) throw new Error('Inventory item not found');
    db.inventory[index] = {
      ...db.inventory[index],
      ...clean,
      itemNumber: requestedItemNumber,
      status: clean.quantity > 0 && clean.status === 'sold_out' ? 'in_stock' : clean.status,
      updatedAt: now
    };
    writeDatabase(db);
    return db.inventory[index];
  }

  const existing = clean.autoGenerateItemNumber ? db.inventory.find((item) =>
    item.itemType === clean.itemType &&
    item.itemName === clean.itemName &&
    item.productCategory === clean.productCategory &&
    item.cardNumber === clean.cardNumber &&
    item.setName === clean.setName &&
    item.rarity === clean.rarity &&
    item.art === clean.art &&
    item.language === clean.language &&
    item.category === clean.category &&
    item.condition === clean.condition &&
    (item.gradeCompany || '') === (clean.gradeCompany || '') &&
    (item.grade || '') === (clean.grade || '')
  ) : undefined;

  if (existing) {
    existing.quantity += clean.quantity;
    existing.askingPrice = clean.askingPrice;
    existing.costBasis = clean.costBasis;
    existing.floorPrice = clean.floorPrice;
    existing.marketPrice = clean.marketPrice;
    existing.location = clean.location;
    existing.acquisitionSource = clean.acquisitionSource;
    existing.acquisitionDate = clean.acquisitionDate;
    existing.listedOnline = clean.listedOnline;
    existing.tags = clean.tags;
    existing.notes = clean.notes || existing.notes;
    existing.status = existing.quantity > 0 ? 'in_stock' : 'sold_out';
    existing.updatedAt = now;
    writeDatabase(db);
    return existing;
  }

  const item: InventoryItem = {
    id: crypto.randomUUID(),
    orgId: LOCAL_ORG_ID,
    itemNumber: requestedItemNumber,
    itemType: clean.itemType,
    productCategory: clean.productCategory,
    itemName: clean.itemName,
    cardNumber: clean.cardNumber,
    setName: clean.setName,
    rarity: clean.rarity,
    art: clean.art,
    language: clean.language,
    category: clean.category,
    condition: clean.condition,
    gradeCompany: clean.gradeCompany,
    grade: clean.grade,
    certNumber: clean.certNumber,
    quantity: clean.quantity,
    costBasis: clean.costBasis,
    floorPrice: clean.floorPrice,
    askingPrice: clean.askingPrice,
    marketPrice: clean.marketPrice,
    marketPriceUpdatedAt: clean.marketPrice ? now : null,
    location: clean.location,
    acquisitionSource: clean.acquisitionSource,
    acquisitionDate: clean.acquisitionDate,
    listedOnline: clean.listedOnline,
    tags: clean.tags,
    imageUrl: clean.imageUrl,
    notes: clean.notes,
    status: clean.status,
    createdBy: LOCAL_USER_ID,
    createdAt: now,
    updatedAt: now
  };
  db.inventory.unshift(item);
  writeDatabase(db);
  return item;
}

export function deleteLocalInventoryItem(id: string) {
  const db = getLocalDatabase();
  db.inventory = db.inventory.filter((item) => item.id !== id);
  writeDatabase(db);
}

export function completeLocalSale(payload: Omit<QueuedSale, 'id' | 'createdAt' | 'status' | 'lastError'>) {
  const db = getLocalDatabase();
  const existing = db.transactions.find((transaction) => transaction.clientRef === payload.clientRef);
  if (existing) return existing;
  if (!payload.cart.length) throw new Error('Cart is empty');

  const requested = payload.cart.map((line) => {
    const item = db.inventory.find((candidate) => candidate.id === line.inventoryItemId);
    if (!item) throw new Error(`Inventory item ${line.inventoryItemId} not found`);
    const quantity = Math.max(1, Number(line.quantity) || 1);
    if (item.status === 'reserved' || item.quantity < quantity) {
      throw new Error(`Insufficient stock for ${item.itemName} (${item.itemNumber})`);
    }
    return { item, quantity };
  });

  const lineItems = requested.map(({ item, quantity }) => {
    const unitCost = item.costBasis || 0;
    const lineTotal = item.askingPrice * quantity;
    return {
      inventoryItemId: item.id,
      itemNameSnapshot: item.itemName,
      itemTypeSnapshot: item.itemType,
      productCategorySnapshot: item.productCategory,
      itemNumberSnapshot: item.itemNumber,
      raritySnapshot: item.rarity,
      artSnapshot: item.art,
      categorySnapshot: item.category,
      conditionSnapshot: item.condition,
      quantity,
      unitPrice: item.askingPrice,
      unitCost,
      lineTotal,
      lineProfit: (item.askingPrice - unitCost) * quantity,
      costUnknown: item.costBasis == null
    };
  });
  const subtotal = lineItems.reduce((sum, line) => sum + line.lineTotal, 0);
  const discount = Math.min(Math.max(0, payload.discount), subtotal);
  const costTotal = lineItems.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const total = subtotal - discount;
  const costUnknown = lineItems.some((line) => line.costUnknown);
  const now = new Date().toISOString();

  requested.forEach(({ item, quantity }) => {
    item.quantity -= quantity;
    item.status = item.quantity === 0 ? 'sold_out' : item.status;
    item.updatedAt = now;
  });

  const transaction: Transaction = {
    id: crypto.randomUUID(),
    orgId: LOCAL_ORG_ID,
    createdAt: now,
    createdBy: LOCAL_USER_ID,
    eventId: payload.eventId || null,
    lineItems,
    subtotal,
    discount,
    total,
    costTotal,
    grossProfit: total - costTotal,
    costUnknown,
    paymentMethod: payload.paymentMethod,
    status: 'completed',
    notes: payload.notes || null,
    clientRef: payload.clientRef
  };
  db.transactions.unshift(transaction);
  writeDatabase(db);
  return transaction;
}

export function getLocalTransactions(limit = 100) {
  return getLocalDatabase().transactions.slice(0, limit);
}

export function voidLocalSale(transactionId: string) {
  const db = getLocalDatabase();
  const transaction = db.transactions.find((candidate) => candidate.id === transactionId);
  if (!transaction) throw new Error('Transaction not found');
  if (transaction.status === 'voided') return transaction;

  for (const line of transaction.lineItems) {
    const item = db.inventory.find((candidate) => candidate.id === line.inventoryItemId);
    if (!item) continue;
    item.quantity += line.quantity;
    item.status = 'in_stock';
    item.updatedAt = new Date().toISOString();
  }
  transaction.status = 'voided';
  transaction.voidedAt = new Date().toISOString();
  transaction.voidedBy = LOCAL_USER_ID;
  writeDatabase(db);
  return transaction;
}

export function getLocalEvents() {
  return [...getLocalDatabase().events].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function saveLocalEvent(event: Pick<ShowEvent, 'name' | 'startDate' | 'endDate' | 'location'>, id?: string) {
  const db = getLocalDatabase();
  if (event.endDate < event.startDate) throw new Error('End date cannot be before start date');
  if (id) {
    const existing = db.events.find((candidate) => candidate.id === id);
    if (!existing) throw new Error('Event not found');
    Object.assign(existing, event);
    writeDatabase(db);
    return existing;
  }
  const created: ShowEvent = { id: crypto.randomUUID(), orgId: LOCAL_ORG_ID, ...event };
  db.events.unshift(created);
  writeDatabase(db);
  return created;
}

export function getLocalSettings() {
  return getLocalDatabase().settings;
}

export function saveLocalSettings(settings: Partial<Settings>) {
  const db = getLocalDatabase();
  db.settings = { ...db.settings, ...settings, orgId: LOCAL_ORG_ID };
  writeDatabase(db);
  return db.settings;
}

export function createLocalInvite(email: string, role: 'owner' | 'admin') {
  const db = getLocalDatabase();
  const invite: LocalInvitation = {
    id: crypto.randomUUID(),
    orgId: LOCAL_ORG_ID,
    email: email.trim().toLowerCase(),
    role,
    token: crypto.randomUUID(),
    createdBy: LOCAL_USER_ID,
    createdAt: new Date().toISOString()
  };
  db.invitations.push(invite);
  writeDatabase(db);
  return invite;
}

export function removeLocalMembership(id: string) {
  const db = getLocalDatabase();
  db.memberships = db.memberships.filter((membership) => membership.id !== id);
  writeDatabase(db);
}

function writeDatabase(db: LocalDatabase) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  window.dispatchEvent(new Event('cardpulse-local-change'));
}

function normalizeInput(input: InventoryInput) {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const isCard = input.itemType === 'single_card';
  const isSealed = input.itemType === 'sealed_product';
  if (!input.itemName.trim()) throw new Error('Item name is required');
  if (isCard && (!input.cardNumber?.trim() || !input.setName?.trim())) throw new Error('Card number and set name are required');
  if (isSealed && !input.productCategory) throw new Error('Sealed product type is required');
  return {
    itemNumber: input.itemNumber?.trim().toUpperCase() || '',
    autoGenerateItemNumber: input.autoGenerateItemNumber ?? true,
    itemType: input.itemType,
    productCategory: isSealed ? input.productCategory || null : null,
    itemName: input.itemName.trim(),
    cardNumber: isCard ? input.cardNumber?.trim().toUpperCase() || null : null,
    setName: isCard ? input.setName?.trim() || null : null,
    rarity: isCard ? input.rarity || 'C' : null,
    art: isCard ? input.art || 'Base' : null,
    language: input.language,
    category: isCard ? input.category || 'Character' : null,
    condition: input.condition.trim() || (isSealed ? 'SEALED' : input.itemType === 'mystery_pack' ? 'NEW' : 'NM'),
    gradeCompany: isCard && input.condition === 'GRADED' ? input.gradeCompany?.trim() || null : null,
    grade: isCard && input.condition === 'GRADED' ? input.grade?.trim() || null : null,
    certNumber: isCard && input.condition === 'GRADED' ? input.certNumber?.trim() || null : null,
    quantity,
    costBasis: input.costBasis == null ? null : Math.max(0, Number(input.costBasis)),
    floorPrice: input.floorPrice == null ? null : Math.max(0, Number(input.floorPrice)),
    askingPrice: Math.max(0, Number(input.askingPrice) || 0),
    marketPrice: input.marketPrice == null ? null : Math.max(0, Number(input.marketPrice)),
    location: input.location?.trim() || null,
    acquisitionSource: input.acquisitionSource?.trim() || null,
    acquisitionDate: input.acquisitionDate || null,
    listedOnline: Boolean(input.listedOnline),
    tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean),
    imageUrl: input.imageUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status || (quantity > 0 ? 'in_stock' as const : 'sold_out' as const)
  };
}

export function generateLocalItemNumber(
  itemType: InventoryItemType,
  reference: string,
  condition: string,
  items = getLocalDatabase().inventory,
  excludeId?: string
) {
  const cleanReference = reference.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '-');
  const cleanCondition = condition.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanReference || !cleanCondition) return '';
  const prefix = itemType === 'single_card'
    ? `OP-${cleanReference}-${cleanCondition}-`
    : itemType === 'sealed_product'
      ? `SEALED-${cleanReference}-`
      : 'MYSTERY-PACK-';
  const highest = items.reduce((max, item) => {
    if (item.id === excludeId || !item.itemNumber.startsWith(prefix)) return max;
    const sequence = Number(item.itemNumber.slice(prefix.length));
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

function createSeedDatabase(): LocalDatabase {
  const now = new Date().toISOString();
  const organization: Organization = { id: LOCAL_ORG_ID, name: 'CardPulse Demo Booth', createdAt: now };
  const inventory: InventoryItem[] = [
    seedItem('11111111-1111-4111-8111-111111111111', 'OP-OP05-060-NM-001', 'Monkey D. Luffy', 'OP05-060', '[OP-05] Awakening of the New Era', 'Leader', 'Parallel', 'EN', 'Leader', 'NM', 1, 45, 74.99, now),
    seedItem('22222222-2222-4222-8222-222222222222', 'OP-OP05-119-NM-001', 'Monkey D. Luffy', 'OP05-119', '[OP-05] Awakening of the New Era', 'SEC', 'Base', 'EN', 'Character', 'NM', 1, 55, 89.99, now),
    {
      ...seedItem('33333333-3333-4333-8333-333333333333', 'OP-OP02-013-GRADED-001', 'Portgas.D.Ace', 'OP02-013', '[OP-02] Paramount War', 'SR', 'Manga', 'JP', 'Character', 'GRADED', 1, 650, 999.99, now),
      gradeCompany: 'PSA',
      grade: '10'
    },
    seedItem('44444444-4444-4444-8444-444444444444', 'OP-OP01-016-NM-001', 'Nami', 'OP01-016', '[OP-01] Romance Dawn', 'R', 'Base', 'EN', 'Character', 'NM', 8, 0.2, 1, now),
    seedItem('55555555-5555-4555-8555-555555555555', 'OP-OP01-006-LP-001', 'Tony Tony.Chopper', 'OP01-006', '[OP-01] Romance Dawn', 'C', 'Base', 'EN', 'Character', 'LP', 12, 0.15, 0.75, now)
  ];
  const event: ShowEvent = {
    id: '66666666-6666-4666-8666-666666666666',
    orgId: LOCAL_ORG_ID,
    name: 'Weekend Card Show',
    startDate: getLocalDateInputValue(),
    endDate: getLocalDateInputValue(),
    location: 'Demo Hall'
  };

  return {
    version: 1,
    organization,
    memberships: [{
      id: '77777777-7777-4777-8777-777777777777',
      orgId: LOCAL_ORG_ID,
      userId: LOCAL_USER_ID,
      displayName: 'AloyKok',
      role: 'owner',
      createdAt: now,
      organization
    }],
    inventory,
    transactions: [],
    events: [event],
    settings: {
      orgId: LOCAL_ORG_ID,
      currency: 'USD',
      currencySymbol: 'S$',
      defaultCondition: 'NM',
      defaultLanguage: 'EN',
      activeEventId: event.id,
      pricingApiKey: null,
      labelSheetPreset: '30-up-avery-5160',
      agingThresholdDays: 60
    },
    invitations: []
  };
}

function seedItem(
  id: string,
  itemNumber: string,
  itemName: string,
  cardNumber: string,
  setName: string,
  rarity: InventoryItem['rarity'],
  art: InventoryItem['art'],
  language: InventoryItem['language'],
  category: InventoryItem['category'],
  condition: string,
  quantity: number,
  costBasis: number,
  askingPrice: number,
  now: string
): InventoryItem {
  return {
    id,
    orgId: LOCAL_ORG_ID,
    itemNumber,
    itemType: 'single_card',
    productCategory: null,
    itemName,
    cardNumber,
    setName,
    rarity,
    art,
    language,
    category,
    condition,
    certNumber: null,
    quantity,
    costBasis,
    floorPrice: null,
    askingPrice,
    marketPrice: null,
    marketPriceUpdatedAt: null,
    location: null,
    acquisitionSource: null,
    acquisitionDate: null,
    listedOnline: false,
    tags: [],
    imageUrl: null,
    notes: 'Local demo seed item',
    status: quantity > 0 ? 'in_stock' : 'sold_out',
    createdBy: LOCAL_USER_ID,
    createdAt: now,
    updatedAt: now
  };
}

function addInventoryDefaults(item: InventoryItem) {
  let changed = false;
  if (item.certNumber === undefined) {
    item.certNumber = null;
    changed = true;
  }
  if (item.floorPrice === undefined) {
    item.floorPrice = null;
    changed = true;
  }
  if (item.location === undefined) {
    item.location = null;
    changed = true;
  }
  if (item.acquisitionSource === undefined) {
    item.acquisitionSource = null;
    changed = true;
  }
  if (item.acquisitionDate === undefined) {
    item.acquisitionDate = null;
    changed = true;
  }
  if (item.listedOnline === undefined) {
    item.listedOnline = false;
    changed = true;
  }
  if (!Array.isArray(item.tags)) {
    item.tags = [];
    changed = true;
  }
  const legacyRarity = item.rarity as string | null | undefined;
  if (legacyRarity === 'L') {
    item.rarity = 'Leader';
    changed = true;
  }
  if (legacyRarity === 'P' || legacyRarity === 'TR' || legacyRarity === 'SP') {
    item.rarity = 'Promo';
    changed = true;
  }
  return changed;
}
