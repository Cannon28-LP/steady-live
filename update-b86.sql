-- Steady — server update for build b86: friends can see each other's characters.
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.

-- Your character's look: just the item ids you picked (face, hair, outfit…), no free text.
alter table profiles add column if not exists look jsonb;
alter table profiles drop constraint if exists look_size;
alter table profiles add constraint look_size check (look is null or (jsonb_typeof(look) = 'object' and length(look::text) < 600)) not valid;

-- my_friends() now returns each friend's character too.
alter table profiles add column if not exists avatar text;
alter table profiles add column if not exists chal_locks jsonb not null default '{}'::jsonb;
drop function if exists my_friends();
create function my_friends()
returns table (id uuid, display_name text, code text, avatar text, chal_locks jsonb, look jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.code, p.avatar, coalesce(p.chal_locks, '{}'::jsonb), p.look
  from friendships f join profiles p on p.id = f.b_id
  where f.a_id = auth.uid();
$$;
