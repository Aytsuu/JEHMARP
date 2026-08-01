-- Phase 3c: Consolidate RLS policies on unified order tables

drop policy if exists "Agents can read own agent orders" on public."order";
drop policy if exists "Agents can insert own agent orders" on public."order";
drop policy if exists "Agents can update own draft agent orders" on public."order";

create policy "Agents can read own distribution orders"
  on public."order"
  for select
  to authenticated
  using (
    order_kind = 'distribution'
    and agent_id = (select private.current_agent_profile_id())
  );

create policy "Agents can insert own distribution orders"
  on public."order"
  for insert
  to authenticated
  with check (
    order_kind = 'distribution'
    and agent_id = (select private.current_agent_profile_id())
  );

create policy "Agents can update own draft distribution orders"
  on public."order"
  for update
  to authenticated
  using (
    order_kind = 'distribution'
    and agent_id = (select private.current_agent_profile_id())
    and order_status = any (array['pending_customers'::text, 'pending_order'::text])
  )
  with check (
    order_kind = 'distribution'
    and agent_id = (select private.current_agent_profile_id())
  );

drop policy if exists "Admins can manage agent order items" on public.order_item;
drop policy if exists "Agents can insert own agent order items" on public.order_item;
drop policy if exists "Agents can read own agent order items" on public.order_item;
drop policy if exists "Agents can update own draft agent order items" on public.order_item;

create policy "Agents can read own distribution order items"
  on public.order_item
  for select
  to authenticated
  using (
    order_kind = 'distribution'
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = order_item.order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.agent_id = (select private.current_agent_profile_id())
    )
  );

create policy "Agents can insert own distribution order items"
  on public.order_item
  for insert
  to authenticated
  with check (
    order_kind = 'distribution'
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = order_item.order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.agent_id = (select private.current_agent_profile_id())
    )
  );

create policy "Agents can update own draft distribution order items"
  on public.order_item
  for update
  to authenticated
  using (
    order_kind = 'distribution'
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = order_item.order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.agent_id = (select private.current_agent_profile_id())
        and parent_order.order_status = any (array['pending_customers'::text, 'pending_order'::text])
    )
  )
  with check (
    order_kind = 'distribution'
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = order_item.order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.agent_id = (select private.current_agent_profile_id())
    )
  );
