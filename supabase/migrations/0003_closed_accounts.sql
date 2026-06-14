-- Public registration is disabled at the Supabase Auth service. This column
-- lets organization members be identified in reports without exposing emails.

alter table public.memberships
add column display_name text;

alter table public.memberships
add constraint memberships_display_name_not_blank
check (display_name is null or char_length(trim(display_name)) > 0);
