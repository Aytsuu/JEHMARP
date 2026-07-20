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
    where (normalized.search_value is null or unified.search_text like '%' || normalized.search_value || '%')
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

create or replace function "public"."list_admin_invoice_rows"(
  "search_query" "text" default null,
  "balance_status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(balance_status_filter, '') as balance_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer_order.id as order_id,
      invoice.id as invoice_id,
      invoice.invoice_number,
      concat_ws(' ', customer.first_name, customer.last_name) as customer_label,
      invoice.created_at as invoice_created_at,
      coalesce(public.compute_invoice_total(customer_order.id), 0) as invoice_total,
      coalesce(public.compute_payment_total(customer_order.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(customer_order.id), 0) as balance,
      customer_order.payment_status,
      lower(concat_ws(
        ' ',
        invoice.invoice_number,
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email
      )) as search_text
    from public.customer_order
    join public.invoice
      on invoice.order_id = customer_order.id
    join public.customer
      on customer.id = customer_order.customer_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.balance_status_value is null or base_rows.payment_status = normalized.balance_status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.invoice_created_at desc, counted.invoice_id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.invoice_created_at desc, paged.invoice_id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function "public"."list_admin_invoice_rows"("text", "text", integer, integer) owner to "postgres";

create or replace function "public"."list_admin_customer_rows"(
  "search_query" "text" default null,
  "customer_type_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
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
      customer.created_at,
      customer.updated_at,
      agent_profile.display_name as assigned_agent_name,
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

create or replace function "public"."list_admin_activity_rows"(
  "search_query" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  unified as (
    select
      'order-created:' || customer_order.id::text as id,
      'order'::text as category,
      'Created order'::text as title,
      'Order ' || left(customer_order.id::text, 8) || ' for ' || concat_ws(' ', customer.first_name, customer.last_name) as detail,
      customer_order.created_at as occurred_at
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id

    union all

    select
      'order-updated:' || customer_order.id::text,
      'order',
      'Updated order',
      'Order ' || left(customer_order.id::text, 8) || ' is ' || customer_order.order_status || ' with payment ' || customer_order.payment_status,
      customer_order.updated_at
    from public.customer_order
    where customer_order.updated_at > customer_order.created_at

    union all

    select
      'agent-order-created:' || agent_order.id::text,
      'order',
      'Created agent order',
      'Agent order ' || left(agent_order.id::text, 8) || ' for ' || agent_profile.display_name,
      agent_order.created_at
    from public.agent_order
    join public.agent_profile
      on agent_profile.id = agent_order.agent_id

    union all

    select
      'order-status:' || customer_order_status_history.id::text,
      'order',
      'Updated order status',
      'Order ' || left(customer_order_status_history.order_id::text, 8) || ' moved from ' || coalesce(customer_order_status_history.from_status, 'new') || ' to ' || customer_order_status_history.to_status,
      customer_order_status_history.changed_at
    from public.customer_order_status_history

    union all

    select
      'customer-created:' || customer.id::text,
      'customer',
      'Added new customer',
      concat_ws(' ', customer.first_name, customer.last_name) || case when customer.is_reseller then ' - reseller' else '' end,
      customer.created_at
    from public.customer

    union all

    select
      'product-created:' || product.id::text,
      'product',
      'Added product',
      product.name || ' - ' || product.category,
      product.created_at
    from public.product

    union all

    select
      'product-updated:' || product.id::text,
      'product',
      'Updated product',
      product.name || ' is ' || case when product.is_active then 'active' else 'inactive' end || ' and ' || product.stock_status,
      product.updated_at
    from public.product
    where product.updated_at > product.created_at

    union all

    select
      'invoice-created:' || invoice.id::text,
      'invoice',
      'Created invoice',
      invoice.invoice_number || ' for order ' || left(invoice.order_id::text, 8),
      invoice.created_at
    from public.invoice

    union all

    select
      'invoice-updated:' || invoice.id::text,
      'invoice',
      'Updated invoice',
      invoice.invoice_number || ' is ' || invoice.status,
      invoice.updated_at
    from public.invoice
    where invoice.updated_at > invoice.created_at

    union all

    select
      'page-created:' || page.id::text,
      'content',
      'Created content page',
      page.title || ' (' || page.status || ')',
      page.created_at
    from public.page

    union all

    select
      'page-updated:' || page.id::text,
      'content',
      'Updated content page',
      page.title || ' (' || page.status || ')',
      page.updated_at
    from public.page
    where page.updated_at > page.created_at

    union all

    select
      'page-section-created:' || page_section.id::text,
      'content',
      'Created content section',
      page_section.type || ' section (' || page_section.status || ')',
      page_section.created_at
    from public.page_section

    union all

    select
      'page-section-updated:' || page_section.id::text,
      'content',
      'Updated content section',
      page_section.type || ' section (' || page_section.status || ')',
      page_section.updated_at
    from public.page_section
    where page_section.updated_at > page_section.created_at

    union all

    select
      'contact-inquiry-created:' || contact_inquiry.id::text,
      'inquiry',
      'New contact inquiry',
      contact_inquiry.name || ' - ' || contact_inquiry.inquiry_status,
      contact_inquiry.created_at
    from public.contact_inquiry

    union all

    select
      'reseller-application-created:' || reseller_application.id::text,
      'reseller',
      'New reseller application',
      reseller_application.name || ' - ' || reseller_application.planned_transaction_type || ', price list ' || reseller_application.email_delivery_status,
      reseller_application.created_at
    from public.reseller_application
  ),
  base_rows as (
    select
      unified.*,
      lower(concat_ws(' ', unified.title, unified.detail, unified.category)) as search_text
    from unified
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where normalized.search_value is null
      or base_rows.search_text like '%' || normalized.search_value || '%'
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.occurred_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.occurred_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function "public"."list_admin_activity_rows"("text", integer, integer) owner to "postgres";

revoke all on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_order_rows"("text", "text", "text", "text", integer, integer) to service_role;

revoke all on function "public"."list_admin_invoice_rows"("text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_invoice_rows"("text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_invoice_rows"("text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_invoice_rows"("text", "text", integer, integer) to service_role;

revoke all on function "public"."list_admin_customer_rows"("text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_customer_rows"("text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_customer_rows"("text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_customer_rows"("text", "text", integer, integer) to service_role;

revoke all on function "public"."list_admin_activity_rows"("text", integer, integer) from public;
revoke all on function "public"."list_admin_activity_rows"("text", integer, integer) from anon;
revoke all on function "public"."list_admin_activity_rows"("text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_activity_rows"("text", integer, integer) to service_role;
