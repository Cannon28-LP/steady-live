-- Steady — challenge invites need accept before the clock starts.
-- Safe to re-run.

alter table coop add column if not exists status text not null default 'active';
alter table coop add column if not exists accepted uuid[] not null default '{}';

-- Allow any member to update (accept / sync status).
drop policy if exists "update my coop" on coop;
create policy "update my coop" on coop for update
  using (auth.uid() = any(members))
  with check (auth.uid() = any(members));

-- Any member can drop (decline / cancel), not only the host.
drop policy if exists "drop own coop" on coop;
create policy "drop own coop" on coop for delete
  using (auth.uid() = any(members));

update coop set status = 'active' where status is null or status = '';
