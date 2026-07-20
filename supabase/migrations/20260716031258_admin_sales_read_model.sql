create index if not exists customer_order_open_queue_idx
  on public.customer_order (created_at desc, id desc)
  where not (order_status = 'closed' and payment_status = 'paid');

create index if not exists customer_order_sales_closed_paid_idx
  on public.customer_order (created_at desc, id desc)
  where order_status = 'closed' and payment_status = 'paid';

create index if not exists customer_order_sales_source_idx
  on public.customer_order (source, created_at desc, id desc)
  where order_status = 'closed' and payment_status = 'paid';

create or replace function "public"."list_admin_order_rows"(
  "search_query" "text" default null,
  "source_filter" "text" default null,
  "order_status_filter" "text" default null,
  "payment_status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
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
  customer_order_totals as (
    select
      customer_order.id as order_id,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then customer_order_item.partial_quantity
              else customer_order_item.final_quantity
            end * customer_order_item.unit_price
          ),
          0
        ),
        2
      ) as total_amount
    from public.customer_order
    left join public.invoice
      on invoice.order_id = customer_order.id
    left join public.customer_order_item
      on customer_order_item.order_id = customer_order.id
    group by customer_order.id
  ),
  agent_order_totals as (
    select
      agent_order.id as order_id,
      round(coalesce(sum(agent_order_item.quantity * product.default_price), 0), 2) as total_amount
    from public.agent_order
    left join public.agent_order_item
      on agent_order_item.agent_order_id = agent_order.id
    left join public.product
      on product.id = agent_order_item.product_id
    group by agent_order.id
  ),
  agent_order_payment as (
    select
      agent_order.id as order_id,
      count(customer_order.id)::integer as linked_customer_count,
      case
        when count(customer_order.id) = 0 then 'unpaid'
        when bool_and(customer_order.payment_status = 'paid') then 'paid'
        when bool_and(customer_order.payment_status = 'unpaid') then 'unpaid'
        else 'partial'
      end as payment_status
    from public.agent_order
    left join public.customer_order
      on customer_order.agent_order_id = agent_order.id
    group by agent_order.id
  ),
  unified as (
    select
      agent_order.id,
      'agent'::text as row_type,
      agent_order.created_at,
      null::date as release_date,
      agent_order.order_status as status,
      coalesce(agent_profile.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      agent_order_payment.payment_status,
      coalesce(agent_order_totals.total_amount, 0) as total_amount,
      '/admin/agent-orders/' || agent_order.id::text as href,
      agent_order_payment.linked_customer_count,
      lower(concat_ws(
        ' ',
        agent_order.order_status,
        agent_profile.display_name,
        agent_profile.contact
      )) as search_text
    from public.agent_order
    join public.agent_profile
      on agent_profile.id = agent_order.agent_id
    left join agent_order_totals
      on agent_order_totals.order_id = agent_order.id
    left join agent_order_payment
      on agent_order_payment.order_id = agent_order.id

    union all

    select
      customer_order.id,
      'customer'::text as row_type,
      customer_order.created_at,
      customer_order.release_date,
      customer_order.order_status as status,
      concat_ws(' ', customer.first_name, customer.last_name) as customer_label,
      customer_order.source,
      case customer_order.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(customer_order.source, '_', ' '))
      end as source_label,
      customer_order.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      '/admin/orders/' || customer_order.id::text as href,
      null::integer as linked_customer_count,
      lower(concat_ws(
        ' ',
        customer_order.source,
        customer_order.order_status,
        customer_order.payment_status,
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name
      )) as search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    left join public.agent_profile
      on agent_profile.id = customer_order.agent_id
    left join customer_order_totals
      on customer_order_totals.order_id = customer_order.id
    where customer_order.agent_order_id is null
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where not (unified.status = 'closed' and unified.payment_status = 'paid')
      and (normalized.search_value is null or unified.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or unified.source = normalized.source_value)
      and (normalized.order_status_value is null or unified.status = normalized.order_status_value)
      and (normalized.payment_status_value is null or unified.payment_status = normalized.payment_status_value)
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

alter function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) owner to "postgres";

create or replace function "public"."list_admin_sales_rows"(
  "search_query" "text" default null,
  "source_filter" "text" default null,
  "order_status_filter" "text" default null,
  "payment_status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
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
      coalesce(latest_payment.sale_date::text, customer_order.updated_at::text) as sale_date,
      customer_order.release_date,
      concat_ws(' ', customer.first_name, customer.last_name) as customer_label,
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
      '/admin/orders/' || customer_order.id::text as href,
      lower(concat_ws(
        ' ',
        customer_order.source,
        customer_order.order_status,
        customer_order.payment_status,
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name,
        invoice.invoice_number
      )) as search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    left join public.agent_profile
      on agent_profile.id = customer_order.agent_id
    left join lateral (
      select invoice.invoice_number
      from public.invoice
      where invoice.order_id = customer_order.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) invoice on true
    left join lateral (
      select max(payment.payment_date) as sale_date
      from public.payment
      where payment.order_id = customer_order.id
    ) latest_payment on true
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

alter function "public"."list_admin_sales_rows"("text", "text", "text", "text", integer, integer) owner to "postgres";

revoke all on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) to service_role;

revoke all on function "public"."list_admin_sales_rows"("text", "text", "text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_sales_rows"("text", "text", "text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_sales_rows"("text", "text", "text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_sales_rows"("text", "text", "text", "text", integer, integer) to service_role;
