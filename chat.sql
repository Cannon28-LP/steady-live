-- Steady — group chats and quick-chat messages.
-- Run AFTER supabase.sql. Safe to re-run.

create table if not exists crews (
  id         text primary key,
  owner_id   uuid references profiles(id) on delete cascade,
  name       text,
  created_at timestamptz default now()
);

create table if not exists crew_members (
  crew_id text references crews(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (crew_id, user_id)
);

-- Only a phrase id or a single emote is ever stored. No free text, by design.
create table if not exists messages (
  id         bigserial primary key,
  crew_id    text references crews(id) on delete cascade,
  from_id    uuid references profiles(id) on delete cascade,
  kind       text check (kind in ('phrase','emote','system')),
  code       text not null check (char_length(code) <= 64),
  created_at timestamptz default now()
);
create index if not exists messages_crew_time on messages (crew_id, created_at desc);

alter table crews        enable row level security;
alter table crew_members enable row level security;
alter table messages     enable row level security;

create or replace function in_crew(c text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from crew_members where crew_id = c and user_id = auth.uid());
$$;

drop policy if exists "read own crews"   on crews;
drop policy if exists "make crews"       on crews;
drop policy if exists "update own crews" on crews;
create policy "read own crews"   on crews for select using (in_crew(id) or owner_id = auth.uid());
create policy "make crews"       on crews for insert with check (owner_id = auth.uid());
create policy "update own crews" on crews for update using (owner_id = auth.uid());

drop policy if exists "read crew members" on crew_members;
drop policy if exists "add crew members"  on crew_members;
drop policy if exists "drop crew members" on crew_members;
-- You can only add people you are actually friends with.
create policy "read crew members" on crew_members for select using (in_crew(crew_id));
create policy "add crew members"  on crew_members for insert
  with check (user_id = auth.uid() or is_friend(user_id));
create policy "drop crew members" on crew_members for delete
  using (user_id = auth.uid() or exists (select 1 from crews c where c.id = crew_id and c.owner_id = auth.uid()));

drop policy if exists "read crew messages" on messages;
drop policy if exists "send messages"      on messages;
create policy "read crew messages" on messages for select using (in_crew(crew_id));
create policy "send messages"      on messages for insert
  with check (from_id = auth.uid() and in_crew(crew_id));

-- ---------------------------------------------------------------
-- Added later: crew discovery and shared challenges.
-- Without these, a chat or a challenge only ever existed on the
-- phone that created it. Safe to re-run.
-- ---------------------------------------------------------------

-- Every crew you are a member of, however it was created.
create or replace function my_crews()
returns table (id text, name text, owner_id uuid, members uuid[])
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.owner_id,
         array(select cm2.user_id from crew_members cm2 where cm2.crew_id = c.id)
  from crews c
  join crew_members cm on cm.crew_id = c.id
  where cm.user_id = auth.uid();
$$;

create table if not exists coop (
  id         text primary key,
  owner_id   uuid references profiles(id) on delete cascade,
  crew_id    text,
  tier       text,
  quest_id   text,
  started_at date,
  members    uuid[] not null default '{}',
  created_at timestamptz default now()
);
create index if not exists coop_members on coop using gin (members);

alter table coop enable row level security;

drop policy if exists "read my coop"   on coop;
drop policy if exists "make coop"      on coop;
drop policy if exists "drop own coop"  on coop;
create policy "read my coop"  on coop for select using (auth.uid() = any(members));
create policy "make coop"     on coop for insert with check (owner_id = auth.uid() and auth.uid() = any(members));
create policy "drop own coop" on coop for delete using (owner_id = auth.uid());

-- Everything on a challenge you are part of.
create or replace function my_coop()
returns setof coop
language sql security definer stable set search_path = public as $$
  select * from coop where auth.uid() = any(members);
$$;
