create or replace function public.compute_payment_balance(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with order_context as (
    select coalesce(
      customer_order.agent_id is not null
      or customer_order.agent_order_id is not null
      or customer_order.converted_to_agent_order_id is not null,
      false
    ) as deduct_commission
    from public.customer_order
    where customer_order.id = target_order_id
  ),
  commission_total as (
    select round(
      coalesce(
        sum(
          case
            when not coalesce((select deduct_commission from order_context), false) then
              0
            when coalesce(customer_order_item.agent_commission_amount, 0) > 0 then
              customer_order_item.agent_commission_amount
            when product.agent_commission_type = 'percentage' then
              coalesce(customer_order_item.unit_price, product.default_price, 0)
              * coalesce(customer_order_item.final_quantity, 0)
              * coalesce(product.agent_commission_value, 0)
              / 100
            else
              coalesce(customer_order_item.final_quantity, 0)
              * coalesce(product.agent_commission_value, 0)
          end
        ),
        0
      ),
      2
    ) as amount
    from public.customer_order_item
    left join public.product
      on product.id = customer_order_item.product_id
    where customer_order_item.order_id = target_order_id
  )
  select round(
    greatest(
      coalesce(public.compute_invoice_total(target_order_id), 0)
      - coalesce((select amount from commission_total), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    ),
    2
  );
$$;

alter function public.compute_payment_balance(uuid) owner to postgres;

create or replace function public.compute_expected_commission(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with order_context as (
    select coalesce(
      customer_order.agent_id is not null
      or customer_order.agent_order_id is not null
      or customer_order.converted_to_agent_order_id is not null,
      false
    ) as commission_effective
    from public.customer_order
    where customer_order.id = target_order_id
  )
  select round(
    coalesce(
      sum(
        case
          when not coalesce((select commission_effective from order_context), false) then
            0
          when coalesce(customer_order_item.agent_commission_amount, 0) > 0 then
            customer_order_item.agent_commission_amount
          else
            coalesce(
              private.calculate_product_agent_commission(
                customer_order_item.product_id,
                customer_order_item.final_quantity,
                customer_order_item.unit_price
              ),
              0
            )
        end
      ),
      0
    ),
    2
  )
  from public.customer_order_item
  where customer_order_item.order_id = target_order_id;
$$;

alter function public.compute_expected_commission(uuid) owner to postgres;

create or replace function public.compute_earned_commission(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_expected_commission(target_order_id), 0) as expected_commission
  ),
  receivable as (
    select
      invoice_total,
      payment_total,
      expected_commission,
      greatest(invoice_total - expected_commission, 0) as receivable_total
    from totals
  )
  select case
    when expected_commission <= 0 then 0
    when receivable_total <= 0 then round(expected_commission, 2)
    else round(expected_commission * least(payment_total / receivable_total, 1), 2)
  end
  from receivable;
$$;

alter function public.compute_earned_commission(uuid) owner to postgres;

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
              when not (
                customer_order.agent_id is not null
                or customer_order.agent_order_id is not null
                or customer_order.converted_to_agent_order_id is not null
              ) then
                0
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

revoke all on function public.compute_payment_balance(uuid) from public;
grant execute on function public.compute_payment_balance(uuid) to authenticated;
grant execute on function public.compute_payment_balance(uuid) to service_role;

revoke all on function public.compute_expected_commission(uuid) from public;
grant execute on function public.compute_expected_commission(uuid) to anon;
grant execute on function public.compute_expected_commission(uuid) to authenticated;
grant execute on function public.compute_expected_commission(uuid) to service_role;

revoke all on function public.compute_earned_commission(uuid) from public;
grant execute on function public.compute_earned_commission(uuid) to anon;
grant execute on function public.compute_earned_commission(uuid) to authenticated;
grant execute on function public.compute_earned_commission(uuid) to service_role;
