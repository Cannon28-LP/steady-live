-- Steady — month locks for finished challenges (friends can read each other's).
-- Run in Supabase SQL editor. Safe to re-run.
-- One canonical my_friends() (avatar.sql and chal-locks.sql define the same thing). Postgres can't
-- change a function's return columns with "create or replace", so drop it first — that's what made
-- re-running these scripts fail.
alter table profiles add column if not exists avatar text;
alter table profiles add column if not exists chal_locks jsonb not null default '{}'::jsonb;
drop function if exists my_friends();
create function my_friends()
returns table (id uuid, display_name text, code text, avatar text, chal_locks jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.code, p.avatar, coalesce(p.chal_locks, '{}'::jsonb)
  from friendships f join profiles p on p.id = f.b_id
  where f.a_id = auth.uid();
$$;
