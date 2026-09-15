-- Steady — month locks for finished challenges (friends can read each other's).
-- Run in Supabase SQL editor. Safe to re-run.
alter table public.profiles
  add column if not exists chal_locks jsonb not null default '{}'::jsonb;

create or replace function public.my_friends()
returns table (id uuid, display_name text, code text, avatar text, chal_locks jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.code, p.avatar, coalesce(p.chal_locks, '{}'::jsonb)
  from friendships f join profiles p on p.id = f.b_id
  where f.a_id = auth.uid();
$$;
