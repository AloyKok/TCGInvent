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
  v_kind text;
  v_item_id uuid;
  v_qty integer;
  v_item public.inventory_items;
  v_misc_name text;
  v_unit_price numeric(12,2);
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
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'invalid cart line';
    end if;

    v_kind := coalesce(nullif(v_line ->> 'kind', ''), 'inventory');

    begin
      v_qty := coalesce(nullif(v_line ->> 'quantity', '')::integer, 1);
    exception when invalid_text_representation then
      raise exception 'invalid cart line';
    end;

    if v_qty <= 0 then raise exception 'sale quantity must be greater than zero'; end if;

    if v_kind = 'misc' then
      begin
        v_unit_price := nullif(v_line ->> 'unitPrice', '')::numeric;
      exception when invalid_text_representation then
        raise exception 'invalid misc sale amount';
      end;

      if v_unit_price is null or v_unit_price <= 0 then
        raise exception 'misc sale amount must be greater than zero';
      end if;

      v_misc_name := coalesce(nullif(trim(v_line ->> 'name'), ''), 'Others');
      v_line_total := v_unit_price * v_qty;
      v_cost_unknown := true;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'inventoryItemId', null,
        'itemNameSnapshot', v_misc_name,
        'itemTypeSnapshot', 'misc',
        'productCategorySnapshot', null,
        'itemNumberSnapshot', 'MISC',
        'raritySnapshot', null,
        'artSnapshot', null,
        'categorySnapshot', null,
        'conditionSnapshot', 'N/A',
        'quantity', v_qty,
        'unitPrice', v_unit_price,
        'unitCost', 0,
        'lineTotal', v_line_total,
        'lineProfit', 0,
        'costUnknown', true
      ));

      v_subtotal := v_subtotal + v_line_total;
      continue;
    end if;

    if v_kind <> 'inventory' or nullif(v_line ->> 'inventoryItemId', '') is null then
      raise exception 'invalid cart line';
    end if;

    begin
      v_item_id := (v_line ->> 'inventoryItemId')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid cart line';
    end;

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

create or replace function public.void_sale(p_org_id uuid, p_transaction_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_transaction public.transactions;
  v_line jsonb;
  v_item_id uuid;
  v_qty integer;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_member(p_org_id, v_user) then
    raise exception 'not a member of this organization';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id and org_id = p_org_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_transaction.status = 'voided' then
    return v_transaction;
  end if;

  for v_line in select * from jsonb_array_elements(v_transaction.line_items)
  loop
    if nullif(v_line ->> 'inventoryItemId', '') is null then
      continue;
    end if;

    v_item_id := (v_line ->> 'inventoryItemId')::uuid;
    v_qty := (v_line ->> 'quantity')::integer;

    update public.inventory_items
    set
      quantity = quantity + v_qty,
      status = case when status = 'sold_out' then 'in_stock'::public.inventory_status else status end
    where id = v_item_id and org_id = p_org_id;
  end loop;

  update public.transactions
  set status = 'voided', voided_at = now(), voided_by = v_user
  where id = p_transaction_id and org_id = p_org_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

notify pgrst, 'reload schema';
