alter table public.inventory_items
  alter column rarity type text using case
    when rarity::text = 'L' then 'Leader'
    when rarity::text in ('P', 'TR', 'SP') then 'Promo'
    else rarity::text
  end,
  add column if not exists floor_price numeric(12,2) check (floor_price is null or floor_price >= 0),
  add column if not exists location text,
  add column if not exists acquisition_source text,
  add column if not exists acquisition_date date,
  add column if not exists cert_number text,
  add column if not exists listed_online boolean not null default false,
  add column if not exists tags text[];

alter table public.inventory_items
  drop constraint if exists inventory_items_rarity_values_check,
  add constraint inventory_items_rarity_values_check check (
    rarity is null or rarity in ('C', 'UC', 'R', 'SR', 'SEC', 'Leader', 'Promo')
  );

alter table public.settings
  add column if not exists currency_symbol text not null default 'S$',
  add column if not exists aging_threshold_days integer not null default 60
    check (aging_threshold_days between 1 and 3650);

alter table public.transactions
  add column if not exists cost_total numeric(12,2) not null default 0,
  add column if not exists gross_profit numeric(12,2) not null default 0,
  add column if not exists cost_unknown boolean not null default true;

-- Existing completed sales did not lock cost basis at sale time, so they are
-- intentionally marked cost_unknown and report as unknown instead of 100% profit.
update public.transactions
set
  cost_total = 0,
  gross_profit = 0,
  cost_unknown = true,
  line_items = coalesce((
    select jsonb_agg(
      line
      || jsonb_build_object(
        'unitCost', 0,
        'lineProfit', 0,
        'costUnknown', true
      )
    )
    from jsonb_array_elements(line_items) as line
  ), '[]'::jsonb)
where cost_unknown = true;

drop function if exists public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text);

create or replace function public.complete_sale(
  p_org_id uuid,
  p_cart jsonb,
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_event_id uuid default null,
  p_client_ref text default null,
  p_notes text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.transactions;
  v_line jsonb;
  v_item_id uuid;
  v_qty integer;
  v_item public.inventory_items;
  v_unit_cost numeric(12,2);
  v_line_total numeric(12,2);
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_cost_total numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(coalesce(p_discount, 0), 0);
  v_total numeric(12,2);
  v_cost_unknown boolean := false;
  v_transaction public.transactions;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not public.is_org_member(p_org_id, v_user) then raise exception 'not a member of this organization'; end if;
  if nullif(trim(p_client_ref), '') is null then raise exception 'client reference is required'; end if;
  if p_payment_method not in ('cash', 'card', 'other') then raise exception 'invalid payment method'; end if;
  if p_event_id is not null and not exists (
    select 1 from public.show_events where id = p_event_id and org_id = p_org_id
  ) then raise exception 'card show does not belong to this organization'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_client_ref, 0));

  select * into v_existing from public.transactions
  where org_id = p_org_id and client_ref = p_client_ref;
  if found then return v_existing; end if;

  if jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'cart is empty';
  end if;

  for v_line in select * from jsonb_array_elements(p_cart)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or nullif(v_line ->> 'inventoryItemId', '') is null
      or nullif(v_line ->> 'quantity', '') is null then
      raise exception 'invalid cart line';
    end if;

    begin
      v_item_id := (v_line ->> 'inventoryItemId')::uuid;
      v_qty := (v_line ->> 'quantity')::integer;
    exception when invalid_text_representation then
      raise exception 'invalid cart line';
    end;

    if v_qty <= 0 then raise exception 'sale quantity must be greater than zero'; end if;

    update public.inventory_items
    set
      quantity = quantity - v_qty,
      status = case
        when quantity - v_qty = 0 then 'sold_out'::public.inventory_status
        else 'in_stock'::public.inventory_status
      end
    where id = v_item_id
      and org_id = p_org_id
      and status <> 'reserved'
      and quantity >= v_qty
    returning * into v_item;

    if not found then
      v_item := null;
      select * into v_item from public.inventory_items where id = v_item_id and org_id = p_org_id;
      raise exception 'insufficient stock for %',
        coalesce(v_item.item_name || ' (' || v_item.item_number || ')', v_item_id::text)
        using errcode = 'P0001';
    end if;

    v_unit_cost := coalesce(v_item.cost_basis, 0);
    v_line_total := v_item.asking_price * v_qty;
    v_cost_unknown := v_cost_unknown or v_item.cost_basis is null;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'inventoryItemId', v_item.id,
      'itemNameSnapshot', v_item.item_name,
      'itemTypeSnapshot', v_item.item_type,
      'productCategorySnapshot', v_item.product_category,
      'itemNumberSnapshot', v_item.item_number,
      'raritySnapshot', v_item.rarity,
      'artSnapshot', v_item.art,
      'categorySnapshot', v_item.category,
      'conditionSnapshot', v_item.condition,
      'quantity', v_qty,
      'unitPrice', v_item.asking_price,
      'unitCost', v_unit_cost,
      'lineTotal', v_line_total,
      'lineProfit', (v_item.asking_price - v_unit_cost) * v_qty,
      'costUnknown', v_item.cost_basis is null
    ));

    v_subtotal := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + (v_unit_cost * v_qty);
  end loop;

  v_discount := least(v_discount, v_subtotal);
  v_total := v_subtotal - v_discount;

  insert into public.transactions(
    org_id, created_by, event_id, line_items, subtotal, discount, total,
    cost_total, gross_profit, cost_unknown, payment_method, status, notes, client_ref
  )
  values (
    p_org_id, v_user, p_event_id, v_lines, v_subtotal, v_discount, v_total,
    v_cost_total, v_total - v_cost_total, v_cost_unknown,
    p_payment_method::public.payment_method, 'completed', nullif(trim(p_notes), ''), p_client_ref
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) from public;
grant execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
