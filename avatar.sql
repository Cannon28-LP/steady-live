-- Steady — profile pictures. Run after supabase.sql.
-- A 128px JPEG as a data URL, about 5KB. Friends read it through the existing
-- profile policies, so nothing else changes.

alter table profiles add column if not exists avatar text;
alter table profiles add constraint avatar_size check (avatar is null or char_length(avatar) < 30000) not valid;

-- my_friends() now returns the picture too.
create or replace function my_friends()
returns table (id uuid, display_name text, code text, avatar text)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.code, p.avatar
  from friendships f join profiles p on p.id = f.b_id
  where f.a_id = auth.uid();
$$;
