alter table public.customer
add column if not exists credit_limit numeric(12, 2) not null default 1000,
add column if not exists credit_limit_exceeded boolean not null default false;

alter table public.customer
drop constraint if exists customer_credit_limit_check;

alter table public.customer
add constraint customer_credit_limit_check check (credit_limit >= 0);

comment on column public.customer.credit_limit is 'Maximum unpaid/partial order balance the customer may stack before requiring admin confirmation.';
comment on column public.customer.credit_limit_exceeded is 'Derived marker indicating the customer unpaid/partial balance currently exceeds credit_limit.';

create or replace function private.compute_customer_credit_balance(target_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select round(coalesce(sum(public.compute_payment_balance(customer_order.id)), 0), 2)
  from public.customer_order
  where customer_order.customer_id = target_customer_id
    and customer_order.order_status <> 'closed'
    and customer_order.payment_status in ('unpaid', 'partial');
$$;

alter function private.compute_customer_credit_balance(uuid) owner to postgres;

create or replace function private.refresh_customer_credit_limit_status(target_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  current_balance numeric;
begin
  if target_customer_id is null then
    return;
  end if;

  select private.compute_customer_credit_balance(target_customer_id)
  into current_balance;

  update public.customer
  set
    credit_limit_exceeded = coalesce(current_balance, 0) > 0
      and coalesce(current_balance, 0) >= credit_limit,
    updated_at = now()
  where id = target_customer_id
    and credit_limit_exceeded is distinct from (
      coalesce(current_balance, 0) > 0
      and coalesce(current_balance, 0) >= credit_limit
    );
end;
$$;

alter function private.refresh_customer_credit_limit_status(uuid) owner to postgres;

create or replace function private.refresh_customer_credit_after_order_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_customer_credit_limit_status(old.customer_id);
    return old;
  end if;

  perform private.refresh_customer_credit_limit_status(new.customer_id);

  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform private.refresh_customer_credit_limit_status(old.customer_id);
  end if;

  return new;
end;
$$;

alter function private.refresh_customer_credit_after_order_change() owner to postgres;

create or replace function private.refresh_customer_credit_after_order_item_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  target_order_id uuid;
  target_customer_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select customer_order.customer_id
  into target_customer_id
  from public.customer_order
  where customer_order.id = target_order_id;

  perform private.refresh_customer_credit_limit_status(target_customer_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function private.refresh_customer_credit_after_order_item_change() owner to postgres;

create or replace function private.refresh_customer_credit_after_payment_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  target_order_id uuid;
  target_customer_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select customer_order.customer_id
  into target_customer_id
  from public.customer_order
  where customer_order.id = target_order_id;

  perform private.refresh_customer_credit_limit_status(target_customer_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function private.refresh_customer_credit_after_payment_change() owner to postgres;

create or replace function private.refresh_customer_credit_after_limit_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.refresh_customer_credit_limit_status(new.id);
  return new;
end;
$$;

alter function private.refresh_customer_credit_after_limit_change() owner to postgres;

drop trigger if exists refresh_customer_credit_after_order_change on public.customer_order;
create trigger refresh_customer_credit_after_order_change
after insert or delete or update of customer_id, payment_status, order_status
on public.customer_order
for each row
execute function private.refresh_customer_credit_after_order_change();

drop trigger if exists refresh_customer_credit_after_order_item_change on public.customer_order_item;
create trigger refresh_customer_credit_after_order_item_change
after insert or delete or update of partial_quantity, final_quantity, unit_price
on public.customer_order_item
for each row
execute function private.refresh_customer_credit_after_order_item_change();

drop trigger if exists refresh_customer_credit_after_payment_change on public.payment;
create trigger refresh_customer_credit_after_payment_change
after insert or delete or update of amount, order_id
on public.payment
for each row
execute function private.refresh_customer_credit_after_payment_change();

drop trigger if exists refresh_customer_credit_after_limit_change on public.customer;
create trigger refresh_customer_credit_after_limit_change
after update of credit_limit
on public.customer
for each row
execute function private.refresh_customer_credit_after_limit_change();

select private.refresh_customer_credit_limit_status(customer.id)
from public.customer;

create or replace function "public"."list_admin_customer_rows"(
  "search_query" "text" default null,
  "customer_type_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  security definer
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(customer_type_filter, '') as customer_type_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer.id,
      customer.first_name,
      customer.last_name,
      customer.phone_number,
      customer.email,
      customer.address,
      customer.assigned_agent_id,
      customer.is_reseller,
      customer.credit_limit,
      customer.credit_limit_exceeded,
      private.compute_customer_credit_balance(customer.id) as outstanding_credit_balance,
      customer.created_at,
      customer.updated_at,
      agent_profile.display_name as assigned_agent_name,
      exists (
        select 1
        from public.agent_profile customer_agent
        where customer_agent.customer_id = customer.id
      ) as is_agent,
      lower(concat_ws(
        ' ',
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name
      )) as search_text
    from public.customer
    left join public.agent_profile
      on agent_profile.id = customer.assigned_agent_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (
        normalized.customer_type_value is null
        or (normalized.customer_type_value = 'reseller' and base_rows.is_reseller)
        or (normalized.customer_type_value = 'retail' and not base_rows.is_reseller)
      )
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.created_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function "public"."list_admin_customer_rows"("text", "text", integer, integer) owner to "postgres";

revoke all on function "private"."compute_customer_credit_balance"(uuid) from public;
grant execute on function "private"."compute_customer_credit_balance"(uuid) to service_role;

revoke all on function "private"."refresh_customer_credit_limit_status"(uuid) from public;
grant execute on function "private"."refresh_customer_credit_limit_status"(uuid) to service_role;

revoke all on function "private"."refresh_customer_credit_after_order_change"() from public;
revoke all on function "private"."refresh_customer_credit_after_order_item_change"() from public;
revoke all on function "private"."refresh_customer_credit_after_payment_change"() from public;
revoke all on function "private"."refresh_customer_credit_after_limit_change"() from public;

revoke all on function "public"."list_admin_customer_rows"("text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_customer_rows"("text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_customer_rows"("text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_customer_rows"("text", "text", integer, integer) to service_role;
