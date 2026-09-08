-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260804000011_allow_agent_order_conversion_status_remap.sql

-- In-place customer/personal -> distribution conversion remaps customer statuses
-- onto distribution draft statuses. Admin conversion uses pending_customers;
-- agent conversion uses pending_order.

create or replace function private.is_valid_distribution_order_status_transition(
  from_status text,
  to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when from_status is null then to_status in ('pending_customers', 'pending_order', 'processing', 'closed')
    when from_status = to_status then true
    when from_status = 'pending' then to_status in ('pending_customers', 'pending_order')
    when from_status = 'pending_customers' then to_status in ('pending_order', 'processing', 'closed')
    when from_status = 'pending_order' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed', 'pending_customers', 'pending_order')
    when from_status = 'closed' then false
    else false
  end;
$$;
