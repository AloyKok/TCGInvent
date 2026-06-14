import type { Database } from '../../types/database';
import type { InventoryItem, Membership, Organization, Settings, ShowEvent, Transaction } from '../../types/domain';

type Tables = Database['public']['Tables'];

export function mapOrganization(row: Tables['organizations']['Row']): Organization {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at
  };
}

export function mapMembership(row: Tables['memberships']['Row'] & { organizations?: Tables['organizations']['Row'] | null }): Membership {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    organization: row.organizations ? mapOrganization(row.organizations) : undefined
  };
}

export function mapInventoryItem(row: Tables['inventory_items']['Row']): InventoryItem {
  return {
    id: row.id,
    orgId: row.org_id,
    itemNumber: row.item_number,
    cardName: row.card_name,
    cardNumber: row.card_number,
    setName: row.set_name,
    rarity: row.rarity,
    art: row.art,
    language: row.language,
    category: row.category,
    condition: row.condition,
    gradeCompany: row.grade_company,
    grade: row.grade,
    quantity: row.quantity,
    costBasis: row.cost_basis,
    askingPrice: Number(row.asking_price),
    marketPrice: row.market_price === null ? null : Number(row.market_price),
    marketPriceUpdatedAt: row.market_price_updated_at,
    imageUrl: row.image_url,
    notes: row.notes,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapTransaction(row: Tables['transactions']['Row']): Transaction {
  return {
    id: row.id,
    orgId: row.org_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    eventId: row.event_id,
    lineItems: Array.isArray(row.line_items) ? (row.line_items as unknown as Transaction['lineItems']) : [],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    paymentMethod: row.payment_method,
    status: row.status,
    notes: row.notes,
    clientRef: row.client_ref,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by
  };
}

export function mapSettings(row: Tables['settings']['Row']): Settings {
  return {
    orgId: row.org_id,
    currency: row.currency,
    defaultCondition: row.default_condition,
    defaultLanguage: row.default_language,
    activeEventId: row.active_event_id,
    pricingApiKey: row.pricing_api_key,
    labelSheetPreset: row.label_sheet_preset
  };
}

export function mapShowEvent(row: Tables['show_events']['Row']): ShowEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    date: row.date,
    location: row.location
  };
}
