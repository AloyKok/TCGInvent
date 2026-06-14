alter table public.show_events
  add column start_date date,
  add column end_date date;

update public.show_events
set
  start_date = date,
  end_date = date;

alter table public.show_events
  alter column start_date set not null,
  alter column end_date set not null,
  add constraint show_events_date_range_check check (end_date >= start_date);

drop index if exists public.show_events_org_date_idx;

alter table public.show_events
  drop column date;

create index show_events_org_start_date_idx
  on public.show_events(org_id, start_date desc);

notify pgrst, 'reload schema';
