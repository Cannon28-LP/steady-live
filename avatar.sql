-- Steady — profile pictures. Run after supabase.sql.
-- A 128px JPEG as a data URL, about 5KB. Friends read it through the existing
-- profile policies, so nothing else changes.

alter table profiles add column if not exists avatar text;
-- Size AND shape: only an image data URL. The app also refuses anything else, but a friend's
-- client could write raw markup here.
alter table profiles drop constraint if exists avatar_size;
alter table profiles add constraint avatar_size check (avatar is null or (char_length(avatar) < 30000
  and avatar ~ '^data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$')) not valid;

-- One canonical my_friends() (avatar.sql and chal-locks.sql define the same thing). Postgres can't
-- change a function's return columns with "create or replace", so drop it first — that's what made
-- re-running these scripts fail.
alter table profiles add column if not exists avatar text;
alter table profiles add column if not exists chal_locks jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists look jsonb;   -- your character's look (item ids only)
drop function if exists my_friends();
create function my_friends()
returns table (id uuid, display_name text, code text, avatar text, chal_locks jsonb, look jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.code, p.avatar, coalesce(p.chal_locks, '{}'::jsonb), p.look
  from friendships f join profiles p on p.id = f.b_id
  where f.a_id = auth.uid();
$$;
