create table public.market_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  source text not null check (source in ('yuyutei')),
  source_url text not null check (source_url ~ '^https://yuyu-tei\.jp/(sell|buy)/opc/card/'),
  external_id text,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, inventory_item_id, source)
);

create table public.market_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  source text not null check (source in ('yuyutei')),
  source_url text not null,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'JPY',
  availability text,
  fetched_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index market_mappings_org_source_idx on public.market_mappings(org_id, source);
create index market_mappings_inventory_idx on public.market_mappings(inventory_item_id);
create index market_price_snapshots_org_fetched_idx on public.market_price_snapshots(org_id, fetched_at desc);
create index market_price_snapshots_inventory_source_idx on public.market_price_snapshots(inventory_item_id, source, fetched_at desc);

create trigger market_mappings_set_updated_at
before update on public.market_mappings
for each row execute function public.set_updated_at();

alter table public.market_mappings enable row level security;
alter table public.market_price_snapshots enable row level security;

create policy "members read market mappings"
on public.market_mappings for select
using (public.is_org_member(org_id, auth.uid()));

create policy "members manage market mappings"
on public.market_mappings for all
using (public.is_org_member(org_id, auth.uid()))
with check (
  public.is_org_member(org_id, auth.uid())
  and exists (
    select 1 from public.inventory_items
    where id = market_mappings.inventory_item_id
      and org_id = market_mappings.org_id
  )
);

create policy "members read market snapshots"
on public.market_price_snapshots for select
using (public.is_org_member(org_id, auth.uid()));

create policy "members insert market snapshots"
on public.market_price_snapshots for insert
with check (
  public.is_org_member(org_id, auth.uid())
  and exists (
    select 1 from public.inventory_items
    where id = market_price_snapshots.inventory_item_id
      and org_id = market_price_snapshots.org_id
  )
);

alter publication supabase_realtime add table public.market_mappings;
alter publication supabase_realtime add table public.market_price_snapshots;

notify pgrst, 'reload schema';
