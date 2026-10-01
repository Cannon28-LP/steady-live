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
