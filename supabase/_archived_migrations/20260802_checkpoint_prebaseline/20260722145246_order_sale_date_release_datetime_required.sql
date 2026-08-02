alter table public.customer_order
  add column if not exists sale_date timestamptz;

alter table public.agent_order
  add column if not exists sale_date timestamptz;

create index if not exists customer_order_sale_date_idx
  on public.customer_order using btree (sale_date desc)
  where sale_date is not null;

create index if not exists agent_order_sale_date_idx
  on public.agent_order using btree (sale_date desc)
  where sale_date is not null;

create or replace function private.sync_customer_order_sale_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_status = 'closed' and new.payment_status = 'paid' then
    new.sale_date := coalesce(new.sale_date, now());
  else
    new.sale_date := null;
  end if;

  return new;
end;
$$;

create or replace function private.sync_agent_order_sale_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_status = 'closed' then
    new.sale_date := coalesce(new.sale_date, now());
  else
    new.sale_date := null;
  end if;

  return new;
end;
$$;

alter function private.sync_customer_order_sale_date() owner to postgres;
alter function private.sync_agent_order_sale_date() owner to postgres;

drop trigger if exists sync_customer_order_sale_date on public.customer_order;

create trigger sync_customer_order_sale_date
  before insert or update of order_status, payment_status, sale_date on public.customer_order
  for each row
  execute function private.sync_customer_order_sale_date();

drop trigger if exists sync_agent_order_sale_date on public.agent_order;

create trigger sync_agent_order_sale_date
  before insert or update of order_status, sale_date on public.agent_order
  for each row
  execute function private.sync_agent_order_sale_date();

create or replace function private.close_paid_customer_order(target_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.customer_order
  set order_status = 'closed',
      sale_date = coalesce(sale_date, now()),
      updated_at = now()
  where id = target_order_id
    and payment_status = 'paid'
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public.invoice
      where invoice.order_id = target_order_id
    );
end;
$$;

create or replace function private.refresh_agent_order_status(target_agent_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.agent_order
  set order_status = 'processing',
      sale_date = null,
      updated_at = now()
  where id = target_agent_order_id
    and order_status = 'pending_customers'
    and exists (
      select 1
      from public.customer_order
      where customer_order.agent_order_id = target_agent_order_id
    );

  update public.agent_order
  set order_status = 'closed',
      sale_date = coalesce(sale_date, now()),
      updated_at = now()
  where id = target_agent_order_id
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public.customer_order
      where customer_order.agent_order_id = target_agent_order_id
    )
    and not exists (
      select 1
      from public.customer_order
      where customer_order.agent_order_id = target_agent_order_id
        and customer_order.payment_status is distinct from 'paid'
    );
end;
$$;

alter function private.close_paid_customer_order(uuid) owner to postgres;
alter function private.refresh_agent_order_status(uuid) owner to postgres;

update public.customer_order
set sale_date = coalesce(payment_stats.sale_date, customer_order.updated_at, now())
from (
  select
    customer_order.id as order_id,
    max(payment.payment_date) as sale_date
  from public.customer_order
  left join public.payment
    on payment.order_id = customer_order.id
  where customer_order.order_status = 'closed'
    and customer_order.payment_status = 'paid'
  group by customer_order.id
) payment_stats
where customer_order.id = payment_stats.order_id
  and customer_order.sale_date is null;

update public.agent_order
set sale_date = coalesce(customer_order_stats.sale_date, agent_order.updated_at, now())
from (
  select
    agent_order.id as order_id,
    max(coalesce(customer_order.sale_date, customer_order.updated_at)) as sale_date
  from public.agent_order
  join public.customer_order
    on customer_order.agent_order_id = agent_order.id
  where agent_order.order_status = 'closed'
    and not exists (
      select 1
      from public.customer_order unpaid_order
      where unpaid_order.agent_order_id = agent_order.id
        and unpaid_order.payment_status is distinct from 'paid'
    )
  group by agent_order.id
) customer_order_stats
where agent_order.id = customer_order_stats.order_id
  and agent_order.sale_date is null;

create or replace function public.list_admin_sales_rows(
  search_query text default null,
  source_filter text default null,
  order_status_filter text default null,
  payment_status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
language sql
stable
set search_path = ''
as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(source_filter, '') as source_value,
      nullif(order_status_filter, '') as order_status_value,
      nullif(payment_status_filter, '') as payment_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer_order.id,
      customer_order.created_at,
      coalesce(customer_order.sale_date, customer_order.updated_at)::text as sale_date,
      customer_order.release_date,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      customer_order.source,
      case customer_order.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(customer_order.source, '_', ' '))
      end as source_label,
      customer_order.order_status,
      customer_order.payment_status,
      invoice.invoice_number,
      coalesce(public.compute_invoice_total(customer_order.id), 0) as order_total,
      coalesce(public.compute_payment_total(customer_order.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(customer_order.id), 0) as balance,
      coalesce(payment_stats.payment_count, 0) as payment_count,
      '/admin/orders/customer/' || customer_order.id::text as href,
      lower(concat_ws(
        ' ',
        customer_order.source,
        customer_order.order_status,
        customer_order.payment_status,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        agent_person.display_name,
        invoice.invoice_number
      )) as search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent agent_row
      on agent_row.id = customer_order.agent_id
    left join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join lateral (
      select invoice.invoice_number
      from public.invoice
      where invoice.order_id = customer_order.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) invoice on true
    left join lateral (
      select count(*)::integer as payment_count
      from public.payment
      where payment.order_id = customer_order.id
    ) payment_stats on true
    where customer_order.order_status = 'closed'
      and customer_order.payment_status = 'paid'
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or base_rows.source = normalized.source_value)
      and (normalized.order_status_value is null or base_rows.order_status = normalized.order_status_value)
      and (normalized.payment_status_value is null or base_rows.payment_status = normalized.payment_status_value)
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
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'source' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_sales_rows(text, text, text, text, integer, integer) owner to postgres;

revoke all on function private.sync_customer_order_sale_date() from public;
revoke all on function private.sync_agent_order_sale_date() from public;
grant execute on function private.sync_customer_order_sale_date() to service_role;
grant execute on function private.sync_agent_order_sale_date() to service_role;
