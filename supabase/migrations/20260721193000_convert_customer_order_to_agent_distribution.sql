alter table public.customer_order
  add column if not exists converted_to_agent_order_id uuid,
  add column if not exists converted_to_agent_order_at timestamp with time zone,
  add column if not exists converted_to_agent_order_by uuid;

alter table public.customer_order
  drop constraint if exists customer_order_converted_to_agent_order_id_fkey;

alter table public.customer_order
  add constraint customer_order_converted_to_agent_order_id_fkey
  foreign key (converted_to_agent_order_id)
  references public.agent_order(id)
  on delete restrict;

alter table public.customer_order
  drop constraint if exists customer_order_converted_to_agent_order_by_fkey;

alter table public.customer_order
  add constraint customer_order_converted_to_agent_order_by_fkey
  foreign key (converted_to_agent_order_by)
  references auth.users(id)
  on delete set null;

alter table public.customer_order
  drop constraint if exists customer_order_conversion_metadata_check;

alter table public.customer_order
  add constraint customer_order_conversion_metadata_check
  check (
    (
      converted_to_agent_order_id is null
      and converted_to_agent_order_at is null
      and converted_to_agent_order_by is null
    )
    or (
      converted_to_agent_order_id is not null
      and converted_to_agent_order_at is not null
      and converted_to_agent_order_by is not null
    )
  );

create index if not exists customer_order_converted_to_agent_order_id_idx
  on public.customer_order using btree (converted_to_agent_order_id)
  where converted_to_agent_order_id is not null;

create index if not exists customer_order_unconverted_customer_created_idx
  on public.customer_order using btree (customer_id, created_at desc)
  where converted_to_agent_order_id is null;

comment on column public.customer_order.converted_to_agent_order_id is
  'Agent distribution order created from this historical customer order.';

comment on column public.customer_order.converted_to_agent_order_at is
  'Timestamp when this historical customer order was converted into an agent distribution order.';

comment on column public.customer_order.converted_to_agent_order_by is
  'Admin user who converted this historical customer order into an agent distribution order.';

create or replace function public.convert_customer_order_to_agent_distribution_order(
  target_order_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  source_order public.customer_order%rowtype;
  source_customer public.customer%rowtype;
  target_agent_id uuid;
  inserted_agent_order_id uuid;
  item_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to convert customer orders.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can convert customer orders.';
  end if;

  select *
  into source_order
  from public.customer_order
  where id = target_order_id
  for update;

  if source_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if source_order.converted_to_agent_order_id is not null then
    raise exception 'Customer order was already converted to an agent distribution order.';
  end if;

  if source_order.agent_order_id is not null then
    raise exception 'Customer order is already linked to an agent distribution order.';
  end if;

  if source_order.order_status = 'closed' then
    raise exception 'Closed customer orders cannot be converted.';
  end if;

  if source_order.payment_status <> 'unpaid' then
    raise exception 'Only unpaid customer orders can be converted.';
  end if;

  if exists (
    select 1
    from public.payment
    where payment.order_id = source_order.id
  ) then
    raise exception 'Customer orders with payment records cannot be converted.';
  end if;

  if exists (
    select 1
    from public.agent_received_payment
    where agent_received_payment.order_id = source_order.id
  ) then
    raise exception 'Customer orders with agent payment records cannot be converted.';
  end if;

  if exists (
    select 1
    from public.invoice
    where invoice.order_id = source_order.id
  ) then
    raise exception 'Customer orders with invoices cannot be converted.';
  end if;

  select *
  into source_customer
  from public.customer
  where id = source_order.customer_id;

  if source_customer.id is null then
    raise exception 'Customer order does not have a valid customer.';
  end if;

  target_agent_id := source_customer.promoted_to_agent_id;

  if target_agent_id is null then
    select agent.id
    into target_agent_id
    from public.agent
    where agent.promoted_from_customer_id = source_customer.id
    order by agent.promoted_from_customer_at desc nulls last, agent.created_at desc
    limit 1;
  end if;

  if target_agent_id is null then
    raise exception 'Customer order does not belong to a promoted customer.';
  end if;

  if not exists (
    select 1
    from public.agent
    where agent.id = target_agent_id
  ) then
    raise exception 'Promoted agent record was not found.';
  end if;

  select count(*)
  into item_count
  from public.customer_order_item
  where order_id = source_order.id;

  if item_count = 0 then
    raise exception 'Customer order has no items to convert.';
  end if;

  insert into public.agent_order (
    agent_id,
    order_status,
    notes,
    submitted_by,
    admin_read_at,
    admin_read_by,
    created_at,
    updated_at
  )
  values (
    target_agent_id,
    'pending_customers',
    nullif(
      concat_ws(
        E'\n\n',
        source_order.notes,
        'Converted from customer order ' || source_order.id::text
      ),
      ''
    ),
    coalesce(source_order.submitted_by, (select auth.uid())),
    now(),
    (select auth.uid()),
    now(),
    now()
  )
  returning id into inserted_agent_order_id;

  insert into public.agent_order_item (
    agent_order_id,
    product_id,
    quantity,
    add_details,
    agent_commission_amount,
    created_at,
    updated_at
  )
  select
    inserted_agent_order_id,
    customer_order_item.product_id,
    customer_order_item.partial_quantity,
    customer_order_item.add_details,
    customer_order_item.agent_commission_amount,
    now(),
    now()
  from public.customer_order_item
  where customer_order_item.order_id = source_order.id;

  update public.customer_order
  set converted_to_agent_order_id = inserted_agent_order_id,
      converted_to_agent_order_at = now(),
      converted_to_agent_order_by = (select auth.uid()),
      admin_read_at = coalesce(admin_read_at, now()),
      admin_read_by = coalesce(admin_read_by, (select auth.uid())),
      updated_at = now()
  where id = source_order.id;

  return inserted_agent_order_id;
end;
$$;

alter function public.convert_customer_order_to_agent_distribution_order(uuid) owner to postgres;

revoke all on function public.convert_customer_order_to_agent_distribution_order(uuid) from public;
revoke execute on function public.convert_customer_order_to_agent_distribution_order(uuid) from anon;
revoke execute on function public.convert_customer_order_to_agent_distribution_order(uuid) from authenticated;
grant execute on function public.convert_customer_order_to_agent_distribution_order(uuid) to authenticated;
grant execute on function public.convert_customer_order_to_agent_distribution_order(uuid) to service_role;

comment on function public.convert_customer_order_to_agent_distribution_order(uuid) is
  'Admin-only conversion of an eligible promoted customer order into a new agent distribution order.';

create or replace function private.compute_customer_credit_balance(target_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(
      greatest(
        coalesce(public.compute_invoice_total(customer_order.id), 0)
        - coalesce(public.compute_payment_total(customer_order.id), 0),
        0
      )
    ),
    0
  )
  from public.customer_order
  where customer_order.customer_id = target_customer_id
    and customer_order.order_status <> 'closed'
    and customer_order.payment_status in ('unpaid', 'partial')
    and customer_order.converted_to_agent_order_id is null;
$$;

alter function private.compute_customer_credit_balance(uuid) owner to postgres;

create or replace function public.list_admin_sales_rows(
  search_query text default null,
  source_filter text default null,
  order_status_filter text default null,
  payment_status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
  language sql stable
  set search_path to ''
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
      coalesce(payment_stats.sale_date::text, customer_order.updated_at::text) as sale_date,
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
      select
        count(*)::integer as payment_count,
        max(payment.payment_date) as sale_date
      from public.payment
      where payment.order_id = customer_order.id
    ) payment_stats on true
    where customer_order.order_status = 'closed'
      and customer_order.payment_status = 'paid'
      and customer_order.converted_to_agent_order_id is null
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

create or replace function public.list_admin_invoice_rows(
  search_query text default null,
  balance_status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
language sql
stable
security definer
set search_path = ''
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
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      invoice.created_at as invoice_created_at,
      coalesce(public.compute_invoice_total(customer_order.id), 0) as invoice_total,
      coalesce(public.compute_payment_total(customer_order.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(customer_order.id), 0) as balance,
      customer_order.payment_status,
      lower(concat_ws(
        ' ',
        invoice.invoice_number,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email
      )) as search_text
    from public.customer_order
    join public.invoice
      on invoice.order_id = customer_order.id
    join public.customer
      on customer.id = customer_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where customer_order.converted_to_agent_order_id is null
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

alter function public.list_admin_invoice_rows(text, text, integer, integer) owner to postgres;

create or replace function public.list_admin_order_rows(
  search_query text default null,
  source_filter text default null,
  order_status_filter text default null,
  payment_status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
  language sql stable
  set search_path to ''
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
      ) as total_amount,
      round(
        coalesce(
          sum(
            case
              when customer_order.agent_id is null and customer_order.agent_order_id is null then
                coalesce(customer_order_item.agent_commission_amount, 0)
              when coalesce(customer_order_item.agent_commission_amount, 0) > 0 then
                customer_order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    customer_order_item.product_id,
                    case
                      when invoice.id is null then customer_order_item.partial_quantity
                      else customer_order_item.final_quantity
                    end,
                    customer_order_item.unit_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public.customer_order
    left join public.invoice
      on invoice.order_id = customer_order.id
    left join public.customer_order_item
      on customer_order_item.order_id = customer_order.id
    where customer_order.converted_to_agent_order_id is null
    group by customer_order.id
  ),
  customer_order_paid as (
    select
      customer_order.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public.customer_order
    left join public.payment
      on payment.order_id = customer_order.id
    where customer_order.converted_to_agent_order_id is null
    group by customer_order.id
  ),
  agent_order_totals as (
    select
      agent_order.id as order_id,
      round(coalesce(sum(agent_order_item.quantity * product.default_price), 0), 2) as total_amount,
      round(
        coalesce(
          sum(
            case
              when coalesce(agent_order_item.agent_commission_amount, 0) > 0 then
                agent_order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    agent_order_item.product_id,
                    agent_order_item.quantity,
                    product.default_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public.agent_order
    left join public.agent_order_item
      on agent_order_item.agent_order_id = agent_order.id
    left join public.product
      on product.id = agent_order_item.product_id
    group by agent_order.id
  ),
  agent_order_paid as (
    select
      agent_order.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public.agent_order
    left join public.customer_order
      on customer_order.agent_order_id = agent_order.id
      and customer_order.converted_to_agent_order_id is null
    left join public.payment
      on payment.order_id = customer_order.id
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
      and customer_order.converted_to_agent_order_id is null
    group by agent_order.id
  ),
  agent_order_customer_search as (
    select
      customer_order.agent_order_id as agent_order_id,
      lower(string_agg(
        trim(concat_ws(
          ' ',
          customer_person.first_name,
          customer_person.last_name,
          customer_person.phone_number,
          customer_person.email,
          customer_person.address
        )),
        ' '
      )) as customer_search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where customer_order.agent_order_id is not null
      and customer_order.converted_to_agent_order_id is null
    group by customer_order.agent_order_id
  ),
  unified as (
    select
      agent_order.id,
      'agent'::text as row_type,
      agent_order.created_at,
      null::date as release_date,
      agent_order.order_status as status,
      coalesce(agent_person.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      agent_order_payment.payment_status,
      coalesce(agent_order_totals.total_amount, 0) as total_amount,
      coalesce(agent_order_totals.commission_total, 0) as commission_total,
      coalesce(agent_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(agent_order_totals.total_amount, 0)
        - coalesce(agent_order_totals.commission_total, 0)
        - coalesce(agent_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/agent/' || agent_order.id::text as href,
      agent_order_payment.linked_customer_count,
      lower(concat_ws(
        ' ',
        agent_order.order_status,
        agent_person.display_name,
        agent_person.phone_number,
        agent_order_customer_search.customer_search_text
      )) as search_text
    from public.agent_order
    join public.agent agent_row
      on agent_row.id = agent_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join agent_order_totals
      on agent_order_totals.order_id = agent_order.id
    left join agent_order_payment
      on agent_order_payment.order_id = agent_order.id
    left join agent_order_paid
      on agent_order_paid.order_id = agent_order.id
    left join agent_order_customer_search
      on agent_order_customer_search.agent_order_id = agent_order.id

    union all

    select
      customer_order.id,
      'customer'::text as row_type,
      customer_order.created_at,
      customer_order.release_date,
      customer_order.order_status as status,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      customer_order.source,
      case customer_order.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(customer_order.source, '_', ' '))
      end as source_label,
      customer_order.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      coalesce(customer_order_totals.commission_total, 0) as commission_total,
      coalesce(customer_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(customer_order_totals.total_amount, 0)
        - coalesce(customer_order_totals.commission_total, 0)
        - coalesce(customer_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/customer/' || customer_order.id::text as href,
      null::integer as linked_customer_count,
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
        agent_person.display_name
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
    left join customer_order_totals
      on customer_order_totals.order_id = customer_order.id
    left join customer_order_paid
      on customer_order_paid.order_id = customer_order.id
    where customer_order.agent_order_id is null
      and customer_order.converted_to_agent_order_id is null
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

alter function public.list_admin_order_rows(text, text, text, text, integer, integer) owner to postgres;
