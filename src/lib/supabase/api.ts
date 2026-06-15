import type { User } from '@supabase/supabase-js';
import { isLocalDemoMode, supabase } from './client';
import {
  mapInventoryItem,
  mapMembership,
  mapOrganization,
  mapSettings,
  mapShowEvent,
  mapTransaction
} from './mappers';
import type {
  CardArt,
  CardCategory,
  CardLanguage,
  CardRarity,
  InventoryFilters,
  InventoryItem,
  InventoryItemType,
  InventoryStatus,
  MemberRole,
  QueuedSale,
  SealedProductType,
  Settings,
  ShowEvent
} from '../../types/domain';
import type { Database } from '../../types/database';
import {
  completeLocalSale,
  createLocalInvite,
  deleteLocalInventoryItem,
  getLocalDatabase,
  getLocalEvents,
  getLocalInventory,
  getLocalMemberships,
  getLocalSettings,
  getLocalTransactions,
  generateLocalItemNumber,
  LOCAL_USER_ID,
  removeLocalMembership,
  saveLocalEvent,
  saveLocalInventoryItem,
  saveLocalSettings,
  voidLocalSale
} from '../local/localDatabase';

type InventoryRow = Database['public']['Tables']['inventory_items']['Row'];

export interface InventoryInput {
  itemNumber?: string;
  autoGenerateItemNumber?: boolean;
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
  imageUrl?: string | null;
  notes?: string | null;
  status?: InventoryItem['status'];
}

const accountEmails: Record<string, string> = {
  aloykok: 'aloykok@login.cardpulse.app',
  tedlee: 'tedlee@login.cardpulse.app'
};

export async function signIn(username: string, password: string) {
  if (isLocalDemoMode) return;
  const email = accountEmails[username.trim().toLowerCase()];
  if (!email) throw new Error('Invalid username or password');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Invalid username or password');
}

export async function signOut() {
  if (isLocalDemoMode) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSessionUser(): Promise<User | null> {
  if (isLocalDemoMode) return { id: LOCAL_USER_ID } as User;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function listMemberships() {
  if (isLocalDemoMode) return getLocalMemberships();
  const { data, error } = await supabase
    .from('memberships')
    .select('*, organizations(*)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as Array<Database['public']['Tables']['memberships']['Row'] & { organizations?: Database['public']['Tables']['organizations']['Row'] | null }>).map(mapMembership);
}

export async function bootstrapOwnerOrg(name: string) {
  if (isLocalDemoMode) return getLocalDatabase().organization;
  const { data, error } = await supabase.rpc('bootstrap_owner_org', { p_org_name: name });
  if (error) throw error;
  return mapOrganization(data);
}

export async function acceptInvite(token: string) {
  if (isLocalDemoMode) {
    const membership = getLocalMemberships()[0];
    if (!membership) throw new Error('Local demo membership not found');
    return membership;
  }
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) throw error;
  return mapMembership(data);
}

export async function listInventory(orgId: string, filters?: Partial<InventoryFilters>) {
  if (isLocalDemoMode) return getLocalInventory(filters);
  let query = supabase.from('inventory_items').select('*').eq('org_id', orgId).order('updated_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status as InventoryStatus);
  if (filters?.itemType) query = query.eq('item_type', filters.itemType as InventoryItemType);
  if (filters?.setName) query = query.ilike('set_name', `%${filters.setName}%`);
  if (filters?.rarity) query = query.eq('rarity', filters.rarity as CardRarity);
  if (filters?.art) query = query.eq('art', filters.art as CardArt);
  if (filters?.category) query = query.eq('category', filters.category as CardCategory);
  if (filters?.language) query = query.eq('language', filters.language as CardLanguage);
  if (filters?.condition) query = query.eq('condition', filters.condition);
  if (filters?.lowStockOnly) query = query.lte('quantity', 2).gt('quantity', 0);

  const { data, error } = await query;
  if (error) throw error;

  const items = (data || []).map(mapInventoryItem);
  const search = filters?.search?.trim().toLowerCase();
  if (!search) return items;

  return items.filter((item) =>
    [item.itemName, item.setName, item.cardNumber, item.itemNumber, item.itemType, item.productCategory, item.rarity, item.art, item.category, item.condition]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search)
  );
}

export async function getInventoryItem(orgId: string, idOrItemNumber: string) {
  if (isLocalDemoMode) {
    const normalized = idOrItemNumber.trim().toLowerCase();
    return getLocalInventory().find((item) => item.id.toLowerCase() === normalized || item.itemNumber.toLowerCase() === normalized) || null;
  }
  const normalized = idOrItemNumber.trim();
  const byId = /^[0-9a-f-]{36}$/i.test(normalized);
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .or(byId ? `id.eq.${normalized},item_number.ilike.${normalized}` : `item_number.ilike.${normalized}`)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInventoryItem(data) : null;
}

export async function saveInventoryItem(orgId: string, userId: string, input: InventoryInput, itemId?: string) {
  if (isLocalDemoMode) return saveLocalInventoryItem(input, itemId);
  const clean = normalizeInventoryInput(input);

  if (itemId) {
    const itemNumber = clean.autoGenerateItemNumber
      ? await generateInventoryItemNumber(orgId, clean.itemType, itemNumberReference(clean), clean.condition)
      : clean.itemNumber;
    await assertUniqueItemNumber(orgId, itemNumber, itemId);
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        item_number: itemNumber,
        item_type: clean.itemType,
        product_category: clean.productCategory,
        item_name: clean.itemName,
        card_number: clean.cardNumber,
        set_name: clean.setName,
        rarity: clean.rarity,
        art: clean.art,
        language: clean.language,
        category: clean.category,
        condition: clean.condition,
        grade_company: clean.gradeCompany,
        grade: clean.grade,
        quantity: clean.quantity,
        cost_basis: clean.costBasis,
        asking_price: clean.askingPrice,
        market_price: clean.marketPrice,
        image_url: clean.imageUrl,
        notes: clean.notes,
        status: clean.status
      })
      .eq('org_id', orgId)
      .eq('id', itemId)
      .select('*')
      .single();
    if (error) throw error;
    return mapInventoryItem(data);
  }

  const existing = clean.autoGenerateItemNumber ? await findExactInventoryLine(orgId, clean) : null;
  if (existing) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        quantity: existing.quantity + clean.quantity,
        status: existing.quantity + clean.quantity > 0 ? 'in_stock' : clean.status,
        asking_price: clean.askingPrice,
        cost_basis: clean.costBasis,
        market_price: clean.marketPrice,
        notes: clean.notes || existing.notes
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapInventoryItem(data);
  }

  const itemNumber = clean.autoGenerateItemNumber
    ? await generateInventoryItemNumber(orgId, clean.itemType, itemNumberReference(clean), clean.condition)
    : clean.itemNumber;
  await assertUniqueItemNumber(orgId, itemNumber);

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      org_id: orgId,
      item_number: itemNumber,
      item_type: clean.itemType,
      product_category: clean.productCategory,
      item_name: clean.itemName,
      card_number: clean.cardNumber,
      set_name: clean.setName,
      rarity: clean.rarity,
      art: clean.art,
      language: clean.language,
      category: clean.category,
      condition: clean.condition,
      grade_company: clean.gradeCompany,
      grade: clean.grade,
      quantity: clean.quantity,
      cost_basis: clean.costBasis,
      asking_price: clean.askingPrice,
      market_price: clean.marketPrice,
      image_url: clean.imageUrl,
      notes: clean.notes,
      status: clean.status,
      created_by: userId
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapInventoryItem(data);
}

export async function deleteInventoryItem(orgId: string, id: string) {
  if (isLocalDemoMode) {
    deleteLocalInventoryItem(id);
    return;
  }
  const { error } = await supabase.from('inventory_items').delete().eq('org_id', orgId).eq('id', id);
  if (error) throw error;
}

export async function completeSale(payload: Omit<QueuedSale, 'id' | 'createdAt' | 'status' | 'lastError'>) {
  if (isLocalDemoMode) return completeLocalSale(payload);
  const { data, error } = await supabase.rpc('complete_sale', {
    p_org_id: payload.orgId,
    p_cart: payload.cart,
    p_discount: payload.discount,
    p_payment_method: payload.paymentMethod,
    p_event_id: payload.eventId || null,
    p_client_ref: payload.clientRef,
    p_notes: payload.notes || null
  });
  if (error) throw error;
  return mapTransaction(data);
}

export async function listTransactions(orgId: string, limit = 100) {
  if (isLocalDemoMode) return getLocalTransactions(limit);
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapTransaction);
}

export async function voidSale(orgId: string, transactionId: string) {
  if (isLocalDemoMode) return voidLocalSale(transactionId);
  const { data, error } = await supabase.rpc('void_sale', {
    p_org_id: orgId,
    p_transaction_id: transactionId
  });
  if (error) throw error;
  return mapTransaction(data);
}

export async function listEvents(orgId: string) {
  if (isLocalDemoMode) return getLocalEvents();
  const { data, error } = await supabase.from('show_events').select('*').eq('org_id', orgId).order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapShowEvent);
}

export async function saveEvent(orgId: string, event: Pick<ShowEvent, 'name' | 'startDate' | 'endDate' | 'location'>, id?: string) {
  if (isLocalDemoMode) return saveLocalEvent(event, id);
  if (event.endDate < event.startDate) throw new Error('End date cannot be before start date');
  if (id) {
    const { data, error } = await supabase
      .from('show_events')
      .update({
        name: event.name,
        start_date: event.startDate,
        end_date: event.endDate,
        location: event.location || null
      })
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapShowEvent(data);
  }

  const { data, error } = await supabase
    .from('show_events')
    .insert({
      org_id: orgId,
      name: event.name,
      start_date: event.startDate,
      end_date: event.endDate,
      location: event.location || null
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapShowEvent(data);
}

export async function getSettings(orgId: string): Promise<Settings> {
  if (isLocalDemoMode) return getLocalSettings();
  const { data, error } = await supabase.from('settings').select('*').eq('org_id', orgId).single();
  if (error) throw error;
  return mapSettings(data);
}

export async function updateSettings(orgId: string, settings: Partial<Settings>) {
  if (isLocalDemoMode) return saveLocalSettings(settings);
  const { data, error } = await supabase
    .from('settings')
    .update({
      currency: settings.currency,
      default_condition: settings.defaultCondition,
      default_language: settings.defaultLanguage,
      active_event_id: settings.activeEventId || null,
      pricing_api_key: settings.pricingApiKey || null,
      label_sheet_preset: settings.labelSheetPreset
    })
    .eq('org_id', orgId)
    .select('*')
    .single();
  if (error) throw error;
  return mapSettings(data);
}

export async function inviteAdmin(orgId: string, userId: string, email: string, role: MemberRole = 'admin') {
  if (isLocalDemoMode) return createLocalInvite(email, role);
  const { data, error } = await supabase
    .from('invitations')
    .insert({ org_id: orgId, email: email.trim().toLowerCase(), role, created_by: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function removeMembership(orgId: string, membershipId: string) {
  if (isLocalDemoMode) {
    removeLocalMembership(membershipId);
    return;
  }
  const { error } = await supabase.from('memberships').delete().eq('org_id', orgId).eq('id', membershipId);
  if (error) throw error;
}

async function findExactInventoryLine(orgId: string, input: InventoryInput) {
  let query = supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('item_type', input.itemType)
    .eq('item_name', input.itemName.trim())
    .eq('language', input.language)
    .eq('condition', input.condition.trim());

  query = input.productCategory ? query.eq('product_category', input.productCategory) : query.is('product_category', null);
  query = input.cardNumber ? query.eq('card_number', input.cardNumber.trim()) : query.is('card_number', null);
  query = input.setName ? query.eq('set_name', input.setName.trim()) : query.is('set_name', null);
  query = input.rarity ? query.eq('rarity', input.rarity) : query.is('rarity', null);
  query = input.art ? query.eq('art', input.art) : query.is('art', null);
  query = input.category ? query.eq('category', input.category) : query.is('category', null);
  query = input.gradeCompany ? query.eq('grade_company', input.gradeCompany) : query.is('grade_company', null);
  query = input.grade ? query.eq('grade', input.grade) : query.is('grade', null);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapInventoryItem(data as InventoryRow) : null;
}

function normalizeInventoryInput(input: InventoryInput) {
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
    quantity,
    costBasis: input.costBasis === undefined || input.costBasis === null ? null : Math.max(0, Number(input.costBasis)),
    askingPrice: Math.max(0, Number(input.askingPrice) || 0),
    marketPrice: input.marketPrice === undefined || input.marketPrice === null ? null : Math.max(0, Number(input.marketPrice)),
    imageUrl: input.imageUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status || (quantity > 0 ? 'in_stock' : 'sold_out')
  };
}

export async function generateInventoryItemNumber(
  orgId: string,
  itemType: InventoryItemType,
  reference: string,
  condition: string
) {
  if (isLocalDemoMode) return generateLocalItemNumber(itemType, reference, condition);
  const { data, error } = await supabase.rpc('generate_item_number', {
    p_org_id: orgId,
    p_item_type: itemType,
    p_reference: reference,
    p_condition: condition
  });
  if (error) throw error;
  return data;
}

async function assertUniqueItemNumber(orgId: string, itemNumber: string, excludeId?: string) {
  if (!itemNumber) throw new Error('Item number is required when auto-generation is off');
  let query = supabase
    .from('inventory_items')
    .select('id, item_name')
    .eq('org_id', orgId)
    .ilike('item_number', itemNumber);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (data) throw new Error(`Item number ${itemNumber} is already recorded for ${data.item_name}`);
}

function itemNumberReference(input: Pick<InventoryInput, 'itemType' | 'cardNumber' | 'productCategory'>) {
  if (input.itemType === 'single_card') return input.cardNumber || '';
  if (input.itemType === 'sealed_product') return input.productCategory || 'other_sealed';
  return 'pack';
}
