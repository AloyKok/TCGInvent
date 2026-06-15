alter table public.inventory_items
  alter column art drop default;

notify pgrst, 'reload schema';
