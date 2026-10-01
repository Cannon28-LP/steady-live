-- Steady — friends + backup backend.
-- Paste the WHOLE file into the Supabase SQL editor and Run. Safe to re-run.
-- Then: Authentication → Sign In / Providers → Email enabled, and turn OFF
-- "Confirm email" if you don't want to click a link before signing in.

-- ---------- tables ----------
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  code         text unique not null,
  display_name text not null,
  created_at   timestamptz default now()
);

create table if not exists friendships (
  a_id       uuid references profiles(id) on delete cascade,
  b_id       uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (a_id, b_id)
);

-- Aggregates only. No task names, notes, reasons or "why" here.
create table if not exists daily_stats (
  user_id     uuid references profiles(id) on delete cascade,
  date        date not null,
  cleared     boolean default false,
  done        int default 0,
  expected    int default 0,
  streak      int default 0,
  consistency int default 0,
  level       int default 1,
  title       text,
  opened      boolean,   -- really opened the app that day ("Show up" challenges)
  buys        int,       -- rewards bought that day ("Nobody buys" challenges)
  updated_at  timestamptz default now(),
  primary key (user_id, date)
);

alter table daily_stats add column if not exists opened boolean;
alter table daily_stats add column if not exists buys int;

create table if not exists cheers (
  id      bigserial primary key,
  from_id uuid references profiles(id) on delete cascade,
  to_id   uuid references profiles(id) on delete cascade,
  kind    text check (kind in ('cheer','nudge')),
  date    date not null,
  applied boolean default false,
  unique (from_id, to_id, date)
);

-- Your own full app state, so a new phone restores everything.
create table if not exists vault (
  user_id    uuid primary key references profiles(id) on delete cascade,
  blob       jsonb not null,
  updated_at timestamptz default now()
);

alter table profiles    enable row level security;
alter table friendships enable row level security;
alter table daily_stats enable row level security;
alter table cheers      enable row level security;
alter table vault       enable row level security;

-- ---------- helpers ----------
create or replace function is_friend(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from friendships
    where (a_id = auth.uid() and b_id = other)
       or (b_id = auth.uid() and a_id = other)
  );
$$;

-- Pair BOTH directions in one call, so both sides see each other after one add.
create table if not exists friend_tries (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists friend_tries_user_at on friend_tries (user_id, at);
alter table friend_tries enable row level security;   -- no policies: only add_friend() touches it

create or replace function add_friend(p_code text)
returns table (id uuid, display_name text, code text)
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if (select count(*) from friend_tries t
      where t.user_id = auth.uid() and t.at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many tries — wait an hour and go again.';
  end if;
  insert into friend_tries (user_id) values (auth.uid());
  delete from friend_tries t where t.at < now() - interval '1 day';
  select p.id into target from profiles p where p.code = upper(trim(p_code));
  -- No match returns nothing (the app says "No one with that code"). Raising here would roll back
  -- the try we just counted.
  if target is null then return; end if;
  if target = auth.uid() then raise exception 'That is your own code.'; end if;
  insert into friendships (a_id, b_id) values (auth.uid(), target) on conflict do nothing;
  insert into friendships (a_id, b_id) values (target, auth.uid()) on conflict do nothing;
  return query select p.id, p.display_name, p.code from profiles p where p.id = target;
end; $$;

create or replace function remove_friend(p_other uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships
  where (a_id = auth.uid() and b_id = p_other)
     or (b_id = auth.uid() and a_id = p_other);
$$;

-- Everyone you're paired with, so both sides see each other after one add.
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

-- ---------- policies ----------
-- Profiles are NOT world-readable. Codes are found only through add_friend(),
-- which matches an exact code, so nobody can enumerate names or codes.
drop policy if exists "read profiles"  on profiles;
drop policy if exists "write own"      on profiles;
drop policy if exists "update own"     on profiles;
drop policy if exists "read self or friends" on profiles;
drop policy if exists "insert own profile"   on profiles;
drop policy if exists "update own profile"   on profiles;
create policy "read self or friends" on profiles for select using (id = auth.uid() or is_friend(id));
create policy "insert own profile"   on profiles for insert with check (id = auth.uid());
create policy "update own profile"   on profiles for update using (id = auth.uid());

drop policy if exists "read own links" on friendships;
drop policy if exists "make own links" on friendships;
drop policy if exists "drop own links" on friendships;
create policy "read own links" on friendships for select using (a_id = auth.uid() or b_id = auth.uid());
-- No direct insert policy: pairing only happens through add_friend().

drop policy if exists "read own stats"   on daily_stats;
drop policy if exists "write own stats"  on daily_stats;
drop policy if exists "update own stats" on daily_stats;
create policy "read own stats"   on daily_stats for select using (user_id = auth.uid() or is_friend(user_id));
create policy "write own stats"  on daily_stats for insert with check (user_id = auth.uid());
create policy "update own stats" on daily_stats for update using (user_id = auth.uid());

drop policy if exists "read my cheers"   on cheers;
drop policy if exists "send cheers"      on cheers;
drop policy if exists "mark cheers read" on cheers;
drop policy if exists "update my cheers" on cheers;
create policy "read my cheers"   on cheers for select using (to_id = auth.uid() or from_id = auth.uid());
create policy "send cheers"      on cheers for insert with check (from_id = auth.uid() and is_friend(to_id));
-- Only the person a cheer is FOR can update it (to mark it applied). Letting the sender update too
-- meant re-sending reset applied=false and paid the coins again.
create policy "update my cheers" on cheers for update using (to_id = auth.uid());

drop policy if exists "own vault read"   on vault;
drop policy if exists "own vault write"  on vault;
drop policy if exists "own vault update" on vault;
create policy "own vault read"   on vault for select using (user_id = auth.uid());
create policy "own vault write"  on vault for insert with check (user_id = auth.uid());
create policy "own vault update" on vault for update using (user_id = auth.uid());
