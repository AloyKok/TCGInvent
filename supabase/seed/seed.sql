-- Usage after creating an auth user and organization:
-- supabase db execute --file supabase/seed/seed.sql -- --set org_id=YOUR_ORG_UUID --set user_id=YOUR_AUTH_USER_UUID
--
-- With psql:
-- psql "$DATABASE_URL" -v org_id="'YOUR_ORG_UUID'" -v user_id="'YOUR_AUTH_USER_UUID'" -f supabase/seed/seed.sql

insert into public.inventory_items (
  org_id,
  item_number,
  item_type,
  product_category,
  item_name,
  card_number,
  set_name,
  rarity,
  art,
  language,
  category,
  condition,
  quantity,
  cost_basis,
  asking_price,
  market_price,
  notes,
  status,
  created_by
) values
  (:org_id::uuid, 'OP-OP05-060-NM-001', 'single_card', null, 'Monkey D. Luffy', 'OP05-060', '[OP-05] Awakening of the New Era', 'L', 'Parallel', 'EN', 'Leader', 'NM', 1, 45.00, 74.99, 72.00, 'Demo parallel Leader.', 'in_stock', :user_id::uuid),
  (:org_id::uuid, 'OP-OP05-119-NM-001', 'single_card', null, 'Monkey D. Luffy', 'OP05-119', '[OP-05] Awakening of the New Era', 'SEC', 'Base', 'EN', 'Character', 'NM', 1, 55.00, 89.99, 85.00, 'Demo Secret Rare.', 'in_stock', :user_id::uuid),
  (:org_id::uuid, 'OP-OP02-013-GRADED-001', 'single_card', null, 'Portgas.D.Ace', 'OP02-013', '[OP-02] Paramount War', 'SR', 'Manga', 'JP', 'Character', 'GRADED', 1, 650.00, 999.99, 975.00, 'Demo graded slab.', 'in_stock', :user_id::uuid),
  (:org_id::uuid, 'OP-OP01-016-NM-001', 'single_card', null, 'Nami', 'OP01-016', '[OP-01] Romance Dawn', 'R', 'Base', 'EN', 'Character', 'NM', 8, 0.20, 1.00, 0.75, 'Demo card with quantity.', 'in_stock', :user_id::uuid),
  (:org_id::uuid, 'OP-OP01-006-LP-001', 'single_card', null, 'Tony Tony.Chopper', 'OP01-006', '[OP-01] Romance Dawn', 'C', 'Base', 'EN', 'Character', 'LP', 12, 0.15, 0.75, 0.60, 'Demo common with quantity.', 'in_stock', :user_id::uuid)
on conflict (org_id, item_number) do update set
  quantity = excluded.quantity,
  asking_price = excluded.asking_price,
  status = excluded.status;
