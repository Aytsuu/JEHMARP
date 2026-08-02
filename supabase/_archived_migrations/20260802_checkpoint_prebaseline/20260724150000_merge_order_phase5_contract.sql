-- migration-safety: destructive-reviewed
-- Phase 5: Drop compat views and legacy link columns

drop trigger if exists block_pending_agent_order_customer_link on public."order";

create or replace function private.block_pending_agent_order_customer_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_order_id is not null
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = new.parent_order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.order_status = 'pending_order'
    ) then
    raise exception 'Agent order must be approved before customer orders can be attached.';
  end if;

  return new;
end;
$$;

create trigger block_pending_agent_order_customer_link
  before insert or update of parent_order_id on public."order"
  for each row
  execute function private.block_pending_agent_order_customer_link();

drop view if exists public.customer_order cascade;
drop view if exists public.customer_order_item cascade;
drop view if exists public.customer_order_status_history cascade;
drop view if exists public.agent_order cascade;
drop view if exists public.agent_order_item cascade;

alter table public."order"
  drop constraint if exists customer_order_conversion_metadata_check;

alter table public."order"
  drop column if exists agent_order_id,
  drop column if exists converted_to_agent_order_id,
  drop column if exists converted_to_agent_order_at,
  drop column if exists converted_to_agent_order_by;

drop index if exists customer_order_agent_order_id_idx;
drop index if exists customer_order_converted_to_agent_order_id_idx;

comment on column public."order".parent_order_id is
  'Self-FK to parent distribution order. Replaces legacy agent_order_id and converted_to_agent_order_id.';
