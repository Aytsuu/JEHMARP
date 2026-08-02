-- Restore agent access to identity profiles after profile SSOT migration.
-- Agent rows were readable, but nested profile joins returned null because
-- profile.user_id was not backfilled and RLS only allowed user_id = auth.uid().

update public.profile person
set
  user_id = agent_row.user_id,
  updated_at = now()
from public.agent agent_row
where agent_row.profile_id = person.id
  and agent_row.user_id is not null
  and person.user_id is null
  and not exists (
    select 1
    from public.profile existing
    where existing.user_id = agent_row.user_id
      and existing.id is distinct from person.id
  );

drop policy if exists "Agents can read own agent identity profile" on public.profile;
create policy "Agents can read own agent identity profile"
  on public.profile
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agent agent_row
      where agent_row.profile_id = profile.id
        and agent_row.user_id = (select auth.uid())
        and agent_row.status = 'active'
    )
  );

drop policy if exists "Agents can read assigned customer identity profiles" on public.profile;
create policy "Agents can read assigned customer identity profiles"
  on public.profile
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customer customer_row
      where customer_row.profile_id = profile.id
        and customer_row.assigned_agent_id = (select private.current_agent_profile_id())
    )
  );

drop policy if exists "Agents can update own agent identity profile" on public.profile;
create policy "Agents can update own agent identity profile"
  on public.profile
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.agent agent_row
      where agent_row.profile_id = profile.id
        and agent_row.user_id = (select auth.uid())
        and agent_row.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.agent agent_row
      where agent_row.profile_id = profile.id
        and agent_row.user_id = (select auth.uid())
        and agent_row.status = 'active'
    )
  );
