-- Steady — server update for build b80.
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
-- Needs the earlier scripts to have been run once (supabase.sql, chat.sql, coop-accept.sql).
-- The app keeps working before this runs; these just switch the new fixes on.

-- ---------- Profiles: pictures and challenge locks ----------
alter table profiles add column if not exists avatar text;
alter table profiles add column if not exists chal_locks jsonb not null default '{}'::jsonb;
-- Only ever an image data URL — a friend's client could otherwise store markup here.
alter table profiles drop constraint if exists avatar_size;
alter table profiles add constraint avatar_size check (avatar is null or (char_length(avatar) < 30000
  and avatar ~ '^data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$')) not valid;

-- One canonical my_friends(). "create or replace" can't change return columns, so drop first.
drop function if exists my_friends();
create function my_friends()
returns table (id uuid, display_name text, code text, avatar text, chal_locks jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.code, p.avatar, coalesce(p.chal_locks, '{}'::jsonb)
  from friendships f join profiles p on p.id = f.b_id
  where f.a_id = auth.uid();
$$;

-- ---------- Friend codes can't be brute-forced ----------
-- Codes are now 8 random characters (old 4-character codes get replaced when their owner opens b80),
-- and add_friend allows 20 tries an hour per person.
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

-- ---------- Daily stats: "Show up" and "Nobody buys" challenges ----------
-- opened = you really opened the app that day (a row alone isn't proof); buys = rewards bought that day.
alter table daily_stats add column if not exists opened boolean;
alter table daily_stats add column if not exists buys int;

-- ---------- Cheers: only the person a cheer is for can update it ----------
-- The sender could re-send and reset applied=false, which paid the coins again.
drop policy if exists "update my cheers" on cheers;
create policy "update my cheers" on cheers for update using (to_id = auth.uid());

-- ---------- Chats: only the owner adds people ----------
-- "Anyone can add themselves" let whoever learned a chat id join and read it.
drop policy if exists "add crew members" on crew_members;
create policy "add crew members" on crew_members for insert
  with check (
    exists (select 1 from crews c where c.id = crew_id and c.owner_id = auth.uid())
    and (user_id = auth.uid() or is_friend(user_id))
  );

-- ---------- Challenges: accepting is one atomic step ----------
-- Two people accepting at the same moment used to overwrite each other's accept.
create or replace function accept_coop(p_id text, p_today date)
returns coop
language plpgsql security definer set search_path = public as $$
declare r coop;
begin
  update coop
     set accepted = array(select distinct x from unnest(accepted || auth.uid()) x)
   where id = p_id and auth.uid() = any(members)
  returning * into r;
  if r.id is null then raise exception 'No such challenge.'; end if;
  if r.status = 'pending' and not exists (
       select 1 from unnest(r.members) m
       where m <> r.owner_id and not (m = any(r.accepted))) then
    update coop set status = 'active', started_at = coalesce(p_today, current_date)
     where id = p_id
    returning * into r;
  end if;
  return r;
end; $$;
grant execute on function accept_coop(text, date) to authenticated;
