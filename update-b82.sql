-- Steady — server update for build b82 (launch prep).
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
-- Needs update-b80.sql to have been run first.

-- ---------- Delete account ----------
-- Removes the signed-in user completely. Deleting the auth user cascades through profiles to friendships,
-- daily stats, cheers, the backup vault, chats they own, memberships, messages and push subscriptions.
create or replace function delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in.'; end if;
  -- Challenges keep running for everyone else; just take this person out of them.
  delete from coop where owner_id = me;
  with upd as (
    update coop set members = array_remove(members, me), accepted = array_remove(accepted, me)
     where me = any(members)
    returning id, members
  )
  delete from coop where id in (select id from upd where cardinality(members) < 2);
  delete from friend_tries where user_id = me;
  delete from auth.users where id = me;
end; $$;
revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;

-- ---------- Push reminders (arrive when the app is closed) ----------
create table if not exists push_subs (
  endpoint     text primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  tz_offset    int  not null default 0,     -- minutes east of UTC, refreshed every time the app opens
  morning      text,                        -- 'HH:MM' local, null = off
  evening      text,                        -- 'HH:MM' local, null = off
  last_morning date,
  last_evening date,
  updated_at   timestamptz default now()
);
alter table push_subs add column if not exists last_morning date;
alter table push_subs add column if not exists last_evening date;
alter table push_subs add column if not exists updated_at timestamptz default now();
alter table push_subs enable row level security;
drop policy if exists "read own subs"   on push_subs;
drop policy if exists "add own subs"    on push_subs;
drop policy if exists "update own subs" on push_subs;
drop policy if exists "drop own subs"   on push_subs;
create policy "read own subs"   on push_subs for select using (user_id = auth.uid());
create policy "add own subs"    on push_subs for insert with check (user_id = auth.uid());
create policy "update own subs" on push_subs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "drop own subs"   on push_subs for delete using (user_id = auth.uid());

-- Public settings the app reads at start-up (no secrets here — the push key's public half is public by design).
create table if not exists app_config (key text primary key, value text);
alter table app_config enable row level security;
drop policy if exists "anyone reads config" on app_config;
create policy "anyone reads config" on app_config for select using (true);

-- The schedule that calls the send-reminders function every 5 minutes contains a secret, so it isn't
-- in this public repo — it's in the launch to-do list (steady-launch\LAUNCH-TODO.md) with blanks to fill.
