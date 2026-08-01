create or replace function public.list_admin_sales_rows(
  search_query text default null,
  source_filter text default null,
  order_status_filter text default null,
  payment_status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
)
returns table(records jsonb, total_rows bigint)
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
      order_row.id,
      order_row.created_at,
      order_row.sale_date as sale_date_value,
      order_row.sale_date::text as sale_date,
      order_row.release_date,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      order_row.source,
      case order_row.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(order_row.source, '_', ' '))
      end as source_label,
      order_row.order_status,
      order_row.payment_status,
      invoice.invoice_number,
      coalesce(public.compute_invoice_total(order_row.id), 0) as order_total,
      round(
        greatest(
          coalesce(public.compute_invoice_total(order_row.id), 0)
          - coalesce(public.compute_expected_commission(order_row.id), 0),
          0
        ),
        2
      ) as net_total,
      coalesce(public.compute_payment_total(order_row.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(order_row.id), 0) as balance,
      coalesce(payment_stats.payment_count, 0) as payment_count,
      '/admin/orders/customer/' || order_row.id::text as href,
      lower(concat_ws(
        ' ',
        order_row.source,
        order_row.order_status,
        order_row.payment_status,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        agent_person.display_name,
        invoice.invoice_number
      )) as search_text
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent agent_row
      on agent_row.id = order_row.agent_id
    left join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join lateral (
      select invoice.invoice_number
      from public.invoice
      where invoice.order_id = order_row.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) invoice on true
    left join lateral (
      select count(*)::integer as payment_count
      from public.payment
      where payment.order_id = order_row.id
    ) payment_stats on true
    where order_row.order_kind in ('customer', 'personal')
      and order_row.order_status = 'closed'
      and order_row.payment_status = 'paid'
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
    order by counted.sale_date_value desc nulls last, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'sale_date_value' - 'search_text' - 'source' - 'total_rows' order by paged.sale_date_value desc nulls last, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_sales_rows(text, text, text, text, integer, integer) owner to postgres;
