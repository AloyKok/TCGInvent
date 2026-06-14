-- Cloud deployment hardening added after the local product-validation phase.

grant usage on schema public to authenticated;

revoke all on table public.organizations from anon;
revoke all on table public.memberships from anon;
revoke all on table public.invitations from anon;
revoke all on table public.show_events from anon;
revoke all on table public.inventory_items from anon;
revoke all on table public.transactions from anon;
revoke all on table public.settings from anon;

grant select on table public.organizations to authenticated;
grant select, insert, update, delete on table public.memberships to authenticated;
grant select, insert, update, delete on table public.invitations to authenticated;
grant select, insert, update, delete on table public.show_events to authenticated;
grant select, insert, update, delete on table public.inventory_items to authenticated;
grant select on table public.transactions to authenticated;
grant select, insert, update on table public.settings to authenticated;

-- Postgres Changes only emits rows from tables included in this publication.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['inventory_items', 'transactions', 'show_events', 'settings']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

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
  if v_user is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_member(p_org_id, v_user) then
    raise exception 'not a member of this organization';
  end if;

  if nullif(trim(p_client_ref), '') is null then
    raise exception 'client reference is required';
  end if;

  if p_payment_method not in ('cash', 'card', 'other') then
    raise exception 'invalid payment method';
  end if;

  if p_event_id is not null and not exists (
    select 1
    from public.show_events
    where id = p_event_id and org_id = p_org_id
  ) then
    raise exception 'card show does not belong to this organization';
  end if;

  -- Serialize retries carrying the same idempotency key before touching stock.
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_client_ref, 0));

  select * into v_existing
  from public.transactions
  where org_id = p_org_id and client_ref = p_client_ref;

  if found then
    return v_existing;
  end if;

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
    exception
      when invalid_text_representation then
        raise exception 'invalid cart line';
    end;

    if v_qty <= 0 then
      raise exception 'sale quantity must be greater than zero';
    end if;

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
      select * into v_item
      from public.inventory_items
      where id = v_item_id and org_id = p_org_id;

      raise exception 'insufficient stock for %',
        coalesce(v_item.card_name || ' (' || v_item.item_number || ')', v_item_id::text)
        using errcode = 'P0001';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'inventoryItemId', v_item.id,
      'cardNameSnapshot', v_item.card_name,
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
    org_id,
    created_by,
    event_id,
    line_items,
    subtotal,
    discount,
    total,
    payment_method,
    status,
    notes,
    client_ref
  )
  values (
    p_org_id,
    v_user,
    p_event_id,
    v_lines,
    v_subtotal,
    v_discount,
    v_total,
    p_payment_method::public.payment_method,
    'completed',
    nullif(trim(p_notes), ''),
    p_client_ref
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) from public;
grant execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) to authenticated;
