create type public.inventory_item_type as enum ('single_card', 'sealed_product', 'mystery_pack');
create type public.sealed_product_type as enum (
  'booster_box',
  'booster_pack',
  'starter_deck',
  'special_promo_set',
  'collection',
  'other_sealed'
);

alter table public.inventory_items
  rename column card_name to item_name;

alter table public.inventory_items
  add column item_type public.inventory_item_type not null default 'single_card',
  add column product_category public.sealed_product_type;

alter table public.inventory_items
  alter column card_number drop not null,
  alter column set_name drop not null,
  alter column rarity drop not null,
  alter column art drop not null,
  alter column category drop not null;

alter table public.inventory_items
  drop constraint if exists inventory_items_card_number_check,
  drop constraint if exists inventory_items_set_name_check,
  add constraint inventory_items_product_fields_check check (
    (
      item_type = 'single_card'
      and nullif(trim(card_number), '') is not null
      and nullif(trim(set_name), '') is not null
      and rarity is not null
      and art is not null
      and category is not null
      and product_category is null
    )
    or (
      item_type = 'sealed_product'
      and product_category is not null
      and card_number is null
      and set_name is null
      and rarity is null
      and art is null
      and category is null
    )
    or (
      item_type = 'mystery_pack'
      and product_category is null
      and card_number is null
      and set_name is null
      and rarity is null
      and art is null
      and category is null
    )
  );

drop index if exists public.inventory_items_org_search_idx;

create index inventory_items_org_search_idx on public.inventory_items
  using gin (
    to_tsvector(
      'simple',
      item_name || ' ' || coalesce(set_name, '') || ' ' || coalesce(card_number, '') || ' ' || item_number
    )
  );

drop function if exists public.generate_item_number(uuid, text, text);

create or replace function public.generate_item_number(
  p_org_id uuid,
  p_item_type public.inventory_item_type,
  p_reference text,
  p_condition text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next integer;
begin
  if not public.is_org_member(p_org_id, auth.uid()) then
    raise exception 'not a member of this organization';
  end if;

  if p_item_type = 'single_card' then
    v_prefix := 'OP-' || upper(regexp_replace(trim(p_reference), '[^A-Za-z0-9-]', '', 'g')) ||
      '-' || upper(regexp_replace(trim(p_condition), '[^A-Za-z0-9]', '', 'g')) || '-';
  elsif p_item_type = 'sealed_product' then
    v_prefix := 'SEALED-' || upper(regexp_replace(trim(p_reference), '[^A-Za-z0-9]', '-', 'g')) || '-';
  else
    v_prefix := 'MYSTERY-PACK-';
  end if;

  select coalesce(max((right(item_number, 3))::integer), 0) + 1
  into v_next
  from public.inventory_items
  where org_id = p_org_id
    and item_number like v_prefix || '___'
    and right(item_number, 3) ~ '^[0-9]{3}$';

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

revoke execute on function public.generate_item_number(uuid, public.inventory_item_type, text, text) from public;
grant execute on function public.generate_item_number(uuid, public.inventory_item_type, text, text) to authenticated;

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
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(coalesce(p_discount, 0), 0);
  v_total numeric(12,2);
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
      'lineTotal', v_item.asking_price * v_qty
    ));

    v_subtotal := v_subtotal + (v_item.asking_price * v_qty);
  end loop;

  v_discount := least(v_discount, v_subtotal);
  v_total := v_subtotal - v_discount;

  insert into public.transactions(
    org_id, created_by, event_id, line_items, subtotal, discount, total,
    payment_method, status, notes, client_ref
  )
  values (
    p_org_id, v_user, p_event_id, v_lines, v_subtotal, v_discount, v_total,
    p_payment_method::public.payment_method, 'completed', nullif(trim(p_notes), ''), p_client_ref
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

notify pgrst, 'reload schema';
