-- Phase 3a: Core triggers, constraints, and view insert fixes for unified order model

create or replace function private.is_valid_customer_order_status_transition(
  from_status text,
  to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when from_status is null then to_status in ('pending', 'processing', 'closed')
    when from_status = to_status then true
    when from_status = 'pending' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed')
    when from_status = 'closed' then false
    else false
  end;
$$;

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
    when from_status = 'pending_customers' then to_status in ('pending_order', 'processing', 'closed')
    when from_status = 'pending_order' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed')
    when from_status = 'closed' then false
    else false
  end;
$$;

create or replace function private.is_valid_order_status_transition(
  from_status text,
  to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.is_valid_customer_order_status_transition(from_status, to_status)
     or private.is_valid_distribution_order_status_transition(from_status, to_status);
$$;

create or replace function private.validate_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.order_status is distinct from new.order_status then
    if new.order_kind = 'distribution' then
      if not private.is_valid_distribution_order_status_transition(old.order_status, new.order_status) then
        raise exception 'Invalid distribution order status transition from % to %.', old.order_status, new.order_status;
      end if;
    elsif not private.is_valid_customer_order_status_transition(old.order_status, new.order_status) then
      raise exception 'Invalid order status transition from % to %.', old.order_status, new.order_status;
    end if;
  end if;

  return new;
end;
$$;

alter table public.order_status_history
  drop constraint if exists customer_order_status_history_from_status_check;

alter table public.order_status_history
  drop constraint if exists customer_order_status_history_to_status_check;

alter table public.order_status_history
  drop constraint if exists order_status_history_from_status_check;

alter table public.order_status_history
  drop constraint if exists order_status_history_to_status_check;

alter table public.order_status_history
  add constraint order_status_history_from_status_check
  check (
    from_status is null
    or from_status = any (
      array[
        'pending'::text,
        'processing'::text,
        'closed'::text,
        'pending_customers'::text,
        'pending_order'::text
      ]
    )
  );

alter table public.order_status_history
  add constraint order_status_history_to_status_check
  check (
    to_status = any (
      array[
        'pending'::text,
        'processing'::text,
        'closed'::text,
        'pending_customers'::text,
        'pending_order'::text
      ]
    )
  );

create or replace function private.record_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  if tg_op = 'INSERT' then
    previous_status := null;
  elsif old.order_status is not distinct from new.order_status then
    return new;
  else
    previous_status := old.order_status;
  end if;

  insert into public.order_status_history (
    order_id,
    from_status,
    to_status,
    changed_by,
    notes
  )
  values (
    new.id,
    previous_status,
    new.order_status,
    auth.uid(),
    case
      when previous_status is null then 'Order created with status ' || new.order_status || '.'
      else 'Order status changed from ' || previous_status || ' to ' || new.order_status || '.'
    end
  );

  return new;
end;
$$;

create or replace function private.customer_order_view_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_row public."order"%rowtype;
  resolved_order_kind text;
begin
  resolved_order_kind := case
    when new.agent_id is not null
      and new.customer_id is not null
      and exists (
        select 1
        from public.agent agent_row
        where agent_row.id = new.agent_id
          and agent_row.customer_id = new.customer_id
      )
      and new.source = 'agent_submitted'
    then 'personal'
    else 'customer'
  end;

  insert into public."order" (
    id,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by,
    approved_by,
    approved_at,
    created_at,
    updated_at,
    admin_read_at,
    admin_read_by,
    notes,
    agent_order_id,
    release_date,
    converted_to_agent_order_id,
    converted_to_agent_order_at,
    converted_to_agent_order_by,
    sale_date,
    order_kind,
    parent_order_id,
    converted_at,
    converted_by
  )
  values (
    coalesce(new.id, extensions.gen_random_uuid()),
    new.customer_id,
    new.agent_id,
    new.source,
    new.order_status,
    coalesce(new.payment_status, 'unpaid'),
    new.submitted_by,
    new.approved_by,
    new.approved_at,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    new.admin_read_at,
    new.admin_read_by,
    new.notes,
    new.agent_order_id,
    new.release_date,
    new.converted_to_agent_order_id,
    new.converted_to_agent_order_at,
    new.converted_to_agent_order_by,
    new.sale_date,
    resolved_order_kind,
    coalesce(new.agent_order_id, new.converted_to_agent_order_id),
    new.converted_to_agent_order_at,
    new.converted_to_agent_order_by
  )
  returning * into inserted_row;

  new.id := inserted_row.id;
  return new;
end;
$$;

grant execute on function private.is_valid_customer_order_status_transition(text, text) to service_role;
grant execute on function private.is_valid_distribution_order_status_transition(text, text) to service_role;
