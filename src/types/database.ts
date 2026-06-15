import type {
  CardArt,
  CardCategory,
  CardLanguage,
  CardRarity,
  InventoryItemType,
  InventoryStatus,
  MemberRole,
  PaymentMethod,
  SealedProductType,
  TransactionStatus
} from './domain';

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      memberships: {
        Row: { id: string; org_id: string; user_id: string; display_name: string | null; role: MemberRole; created_at: string };
        Insert: { id?: string; org_id: string; user_id: string; display_name?: string | null; role?: MemberRole; created_at?: string };
        Update: { id?: string; org_id?: string; user_id?: string; display_name?: string | null; role?: MemberRole; created_at?: string };
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: MemberRole;
          token: string;
          status: 'pending' | 'accepted' | 'revoked';
          created_by: string;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role?: MemberRole;
          token?: string;
          status?: 'pending' | 'accepted' | 'revoked';
          created_by: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: MemberRole;
          token?: string;
          status?: 'pending' | 'accepted' | 'revoked';
          created_by?: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          id: string;
          org_id: string;
          item_number: string;
          item_type: InventoryItemType;
          product_category: SealedProductType | null;
          item_name: string;
          card_number: string | null;
          set_name: string | null;
          rarity: CardRarity | null;
          art: CardArt | null;
          language: CardLanguage;
          category: CardCategory | null;
          condition: string;
          grade_company: string | null;
          grade: string | null;
          cert_number: string | null;
          quantity: number;
          cost_basis: number | null;
          floor_price: number | null;
          asking_price: number;
          market_price: number | null;
          market_price_updated_at: string | null;
          location: string | null;
          acquisition_source: string | null;
          acquisition_date: string | null;
          listed_online: boolean;
          tags: string[] | null;
          image_url: string | null;
          notes: string | null;
          status: InventoryStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          item_number: string;
          item_type?: InventoryItemType;
          product_category?: SealedProductType | null;
          item_name: string;
          card_number?: string | null;
          set_name?: string | null;
          rarity?: CardRarity | null;
          art?: CardArt | null;
          language?: CardLanguage;
          category?: CardCategory | null;
          condition?: string;
          grade_company?: string | null;
          grade?: string | null;
          cert_number?: string | null;
          quantity?: number;
          cost_basis?: number | null;
          floor_price?: number | null;
          market_price?: number | null;
          market_price_updated_at?: string | null;
          location?: string | null;
          acquisition_source?: string | null;
          acquisition_date?: string | null;
          listed_online?: boolean;
          tags?: string[] | null;
          image_url?: string | null;
          notes?: string | null;
          status?: InventoryStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          asking_price: number;
        };
        Update: Partial<Database['public']['Tables']['inventory_items']['Row']>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          org_id: string;
          created_at: string;
          created_by: string;
          event_id: string | null;
          line_items: Json;
          subtotal: number;
          discount: number;
          total: number;
          cost_total: number;
          gross_profit: number;
          cost_unknown: boolean;
          payment_method: PaymentMethod;
          status: TransactionStatus;
          notes: string | null;
          client_ref: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      show_events: {
        Row: { id: string; org_id: string; name: string; start_date: string; end_date: string; location: string | null; created_at: string };
        Insert: { id?: string; org_id: string; name: string; start_date: string; end_date: string; location?: string | null; created_at?: string };
        Update: { id?: string; org_id?: string; name?: string; start_date?: string; end_date?: string; location?: string | null; created_at?: string };
        Relationships: [];
      };
      settings: {
        Row: {
          org_id: string;
          currency: string;
          currency_symbol: string;
          default_condition: string;
          default_language: CardLanguage;
          active_event_id: string | null;
          pricing_api_key: string | null;
          label_sheet_preset: string;
          aging_threshold_days: number;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          currency?: string;
          currency_symbol?: string;
          default_condition?: string;
          default_language?: CardLanguage;
          active_event_id?: string | null;
          pricing_api_key?: string | null;
          label_sheet_preset?: string;
          aging_threshold_days?: number;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          currency?: string;
          currency_symbol?: string;
          default_condition?: string;
          default_language?: CardLanguage;
          active_event_id?: string | null;
          pricing_api_key?: string | null;
          label_sheet_preset?: string;
          aging_threshold_days?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bootstrap_owner_org: { Args: { p_org_name: string }; Returns: Database['public']['Tables']['organizations']['Row'] };
      accept_invite: { Args: { p_token: string }; Returns: Database['public']['Tables']['memberships']['Row'] };
      complete_sale: {
        Args: {
          p_org_id: string;
          p_cart: Json;
          p_discount?: number;
          p_payment_method?: string;
          p_event_id?: string | null;
          p_client_ref?: string | null;
          p_notes?: string | null;
        };
        Returns: Database['public']['Tables']['transactions']['Row'];
      };
      generate_item_number: {
        Args: { p_org_id: string; p_item_type: InventoryItemType; p_reference: string; p_condition: string };
        Returns: string;
      };
      void_sale: { Args: { p_org_id: string; p_transaction_id: string }; Returns: Database['public']['Tables']['transactions']['Row'] };
    };
    Enums: {
      member_role: MemberRole;
      card_language: CardLanguage;
      card_rarity: CardRarity;
      card_art: CardArt;
      card_category: CardCategory;
      inventory_item_type: InventoryItemType;
      sealed_product_type: SealedProductType;
      inventory_status: InventoryStatus;
      payment_method: PaymentMethod;
      transaction_status: TransactionStatus;
      invite_status: 'pending' | 'accepted' | 'revoked';
    };
    CompositeTypes: Record<string, never>;
  };
}
