-- Steady — fix chat RLS so crews can get members and messages.
-- Safe to re-run.

drop policy if exists "read own crews" on crews;
drop policy if exists "make crews" on crews;
drop policy if exists "update own crews" on crews;
create policy "read own crews" on crews for select
  using (owner_id = auth.uid() or in_crew(id));
create policy "make crews" on crews for insert
  with check (owner_id = auth.uid());
create policy "update own crews" on crews for update
  using (owner_id = auth.uid());

drop policy if exists "read crew members" on crew_members;
drop policy if exists "add crew members" on crew_members;
drop policy if exists "drop crew members" on crew_members;

-- Owner can always see/add members; anyone can add themselves; friends OK for owner.
create policy "read crew members" on crew_members for select
  using (
    user_id = auth.uid()
    or in_crew(crew_id)
    or exists (select 1 from crews c where c.id = crew_id and c.owner_id = auth.uid())
  );

create policy "add crew members" on crew_members for insert
  with check (
    user_id = auth.uid()
    or (
      exists (select 1 from crews c where c.id = crew_id and c.owner_id = auth.uid())
      and is_friend(user_id)
    )
  );

create policy "drop crew members" on crew_members for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from crews c where c.id = crew_id and c.owner_id = auth.uid())
  );

drop policy if exists "read crew messages" on messages;
drop policy if exists "send messages" on messages;
create policy "read crew messages" on messages for select using (in_crew(crew_id));
create policy "send messages" on messages for insert
  with check (from_id = auth.uid() and in_crew(crew_id));
