create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin');
create type public.card_language as enum ('EN', 'JP', 'OTHER');
create type public.card_rarity as enum ('C', 'UC', 'R', 'SR', 'SEC', 'L', 'P', 'TR', 'SP');
create type public.card_art as enum ('Base', 'Parallel', 'Manga');
create type public.card_category as enum ('Character', 'Leader', 'Event', 'Stage', 'DON');
create type public.inventory_status as enum ('in_stock', 'sold_out', 'reserved');
create type public.payment_method as enum ('cash', 'card', 'other');
create type public.transaction_status as enum ('completed', 'voided');
create type public.invite_status as enum ('pending', 'accepted', 'revoked');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'admin',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null default 'admin',
  token uuid not null default gen_random_uuid(),
  status public.invite_status not null default 'pending',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (token)
);

create table public.show_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  date date not null,
  location text,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_number text not null,
  card_name text not null check (char_length(trim(card_name)) > 0),
  card_number text not null check (char_length(trim(card_number)) > 0),
  set_name text not null check (char_length(trim(set_name)) > 0),
  rarity public.card_rarity not null,
  art public.card_art not null default 'Base',
  language public.card_language not null default 'EN',
  category public.card_category not null,
  condition text not null default 'NM',
  grade_company text,
  grade text,
  quantity integer not null default 1 check (quantity >= 0),
  cost_basis numeric(12,2) check (cost_basis is null or cost_basis >= 0),
  asking_price numeric(12,2) not null check (asking_price >= 0),
  market_price numeric(12,2) check (market_price is null or market_price >= 0),
  market_price_updated_at timestamptz,
  image_url text,
  notes text,
  status public.inventory_status not null default 'in_stock',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, item_number)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  event_id uuid references public.show_events(id) on delete set null,
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method public.payment_method not null default 'cash',
  status public.transaction_status not null default 'completed',
  notes text,
  client_ref text,
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  unique (org_id, client_ref)
);

create table public.settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  currency text not null default 'USD',
  default_condition text not null default 'NM',
  default_language public.card_language not null default 'EN',
  active_event_id uuid references public.show_events(id) on delete set null,
  pricing_api_key text,
  label_sheet_preset text not null default '30-up-avery-5160',
  updated_at timestamptz not null default now()
);

create index inventory_items_org_search_idx on public.inventory_items
  using gin (to_tsvector('simple', card_name || ' ' || set_name || ' ' || card_number || ' ' || item_number));
create index inventory_items_org_status_idx on public.inventory_items(org_id, status);
create index inventory_items_org_item_number_idx on public.inventory_items(org_id, item_number);
create index transactions_org_created_at_idx on public.transactions(org_id, created_at desc);
create index transactions_org_created_by_idx on public.transactions(org_id, created_by);
create index show_events_org_date_idx on public.show_events(org_id, date desc);
create index memberships_user_idx on public.memberships(user_id);
create index invitations_token_idx on public.invitations(token) where status = 'pending';
create unique index invitations_org_email_pending_idx on public.invitations(org_id, lower(email)) where status = 'pending';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

create or replace function public.generate_item_number(p_org_id uuid, p_card_number text, p_condition text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next integer;
  v_code text;
begin
  if not exists (
    select 1 from public.memberships
    where org_id = p_org_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this organization';
  end if;

  v_prefix := 'OP-' || upper(regexp_replace(trim(p_card_number), '[^A-Za-z0-9-]', '', 'g')) ||
    '-' || upper(regexp_replace(trim(p_condition), '[^A-Za-z0-9]', '', 'g')) || '-';

  select coalesce(max((right(item_number, 3))::integer), 0) + 1
  into v_next
  from public.inventory_items
  where org_id = p_org_id
    and item_number like v_prefix || '___'
    and right(item_number, 3) ~ '^[0-9]{3}$';

  v_code := v_prefix || lpad(v_next::text, 3, '0');
  return v_code;
end;
$$;

create or replace function public.is_org_member(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = p_user_id
  );
$$;

create or replace function public.is_org_owner(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = p_user_id and m.role = 'owner'
  );
$$;

create or replace function public.bootstrap_owner_org(p_org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations(name)
  values (coalesce(nullif(trim(p_org_name), ''), 'CardPulse Booth'))
  returning * into v_org;

  insert into public.memberships(org_id, user_id, role)
  values (v_org.id, v_user, 'owner');

  insert into public.settings(org_id)
  values (v_org.id);

  return v_org;
end;
$$;

create or replace function public.accept_invite(p_token uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.invitations;
  v_membership public.memberships;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select * into v_invite
  from public.invitations
  where token = p_token and status = 'pending'
  for update;

  if not found then
    raise exception 'invite not found or no longer pending';
  end if;

  if lower(v_invite.email) <> v_email then
    raise exception 'invite email does not match signed-in user';
  end if;

  insert into public.memberships(org_id, user_id, role)
  values (v_invite.org_id, v_user, v_invite.role)
  on conflict (org_id, user_id) do update set role = excluded.role
  returning * into v_membership;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invite.id;

  return v_membership;
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

  if p_payment_method not in ('cash', 'card', 'other') then
    raise exception 'invalid payment method';
  end if;

  if p_client_ref is not null then
    select * into v_existing
    from public.transactions
    where org_id = p_org_id and client_ref = p_client_ref;

    if found then
      return v_existing;
    end if;
  end if;

  if jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'cart is empty';
  end if;

  for v_line in select * from jsonb_array_elements(p_cart)
  loop
    v_item_id := coalesce(v_line ->> 'inventoryItemId', v_line ->> 'id')::uuid;
    v_qty := greatest(coalesce((v_line ->> 'quantity')::integer, 1), 1);

    update public.inventory_items
    set
      quantity = quantity - v_qty,
      status = case when quantity - v_qty = 0 then 'sold_out'::public.inventory_status else status end
    where id = v_item_id
      and org_id = p_org_id
      and status <> 'reserved'
      and quantity >= v_qty
    returning * into v_item;

    if not found then
      select * into v_item from public.inventory_items where id = v_item_id and org_id = p_org_id;
      raise exception 'insufficient stock for %', coalesce(v_item.card_name || ' (' || v_item.item_number || ')', v_item_id::text)
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
    p_notes,
    p_client_ref
  )
  returning * into v_transaction;

  return v_transaction;
exception
  when unique_violation then
    if p_client_ref is not null then
      select * into v_existing
      from public.transactions
      where org_id = p_org_id and client_ref = p_client_ref;
      if found then
        return v_existing;
      end if;
    end if;
    raise;
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

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.show_events enable row level security;
alter table public.inventory_items enable row level security;
alter table public.transactions enable row level security;
alter table public.settings enable row level security;

create policy "members read organizations"
on public.organizations for select
using (public.is_org_member(id));

create policy "members read memberships"
on public.memberships for select
using (public.is_org_member(org_id));

create policy "owners insert memberships"
on public.memberships for insert
with check (public.is_org_owner(org_id));

create policy "owners update memberships"
on public.memberships for update
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id));

create policy "owners delete memberships"
on public.memberships for delete
using (public.is_org_owner(org_id) and user_id <> auth.uid());

create policy "owners manage invitations"
on public.invitations for all
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id) and created_by = auth.uid());

create policy "members read events"
on public.show_events for select
using (public.is_org_member(org_id));

create policy "members insert events"
on public.show_events for insert
with check (public.is_org_member(org_id));

create policy "members update events"
on public.show_events for update
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "members delete events"
on public.show_events for delete
using (public.is_org_member(org_id));

create policy "members read inventory"
on public.inventory_items for select
using (public.is_org_member(org_id));

create policy "members insert inventory"
on public.inventory_items for insert
with check (public.is_org_member(org_id) and created_by = auth.uid());

create policy "members update inventory"
on public.inventory_items for update
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "members delete inventory"
on public.inventory_items for delete
using (public.is_org_member(org_id));

create policy "members read transactions"
on public.transactions for select
using (public.is_org_member(org_id));

create policy "members read settings"
on public.settings for select
using (public.is_org_member(org_id));

create policy "owners insert settings"
on public.settings for insert
with check (public.is_org_owner(org_id));

create policy "owners update settings"
on public.settings for update
using (public.is_org_owner(org_id))
with check (public.is_org_owner(org_id));

revoke execute on function public.bootstrap_owner_org(text) from public;
revoke execute on function public.accept_invite(uuid) from public;
revoke execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) from public;
revoke execute on function public.void_sale(uuid, uuid) from public;
revoke execute on function public.generate_item_number(uuid, text, text) from public;

grant execute on function public.bootstrap_owner_org(text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) to authenticated;
grant execute on function public.void_sale(uuid, uuid) to authenticated;
grant execute on function public.generate_item_number(uuid, text, text) to authenticated;
