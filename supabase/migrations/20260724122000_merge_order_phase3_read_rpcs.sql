-- Phase 3b: Rewrite read/compute RPCs to query unified order and order_item directly

create or replace function private.agent_can_access_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public."order" order_row
      left join public.customer
        on customer.id = order_row.customer_id
      where order_row.id = target_order_id
        and order_row.order_kind in ('customer', 'personal')
        and (
          order_row.agent_id = (select private.current_agent_profile_id())
          or customer.assigned_agent_id = (select private.current_agent_profile_id())
        )
    )
    or exists (
      select 1
      from public."order" distribution_order
      where distribution_order.id = target_order_id
        and distribution_order.order_kind = 'distribution'
        and distribution_order.agent_id = (select private.current_agent_profile_id())
    )
    or exists (
      select 1
      from public."order" child_order
      join public."order" distribution_order
        on distribution_order.id = child_order.parent_order_id
      where child_order.id = target_order_id
        and child_order.order_kind in ('customer', 'personal')
        and distribution_order.order_kind = 'distribution'
        and distribution_order.agent_id = (select private.current_agent_profile_id())
    ),
    false
  );
$$;

alter function private.agent_can_access_order(uuid) owner to postgres;

create or replace function private.agent_order_approved_distributed_quantity(
  target_agent_order_id uuid,
  target_product_id uuid
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(order_item.partial_quantity), 0)
  from public."order" child_order
  join public.order_item
    on order_item.order_id = child_order.id
    and order_item.order_kind in ('customer', 'personal')
  where child_order.parent_order_id = target_agent_order_id
    and child_order.order_kind in ('customer', 'personal')
    and child_order.order_status <> 'pending'
    and order_item.product_id = target_product_id;
$$;

alter function private.agent_order_approved_distributed_quantity(uuid, uuid) owner to postgres;

create or replace function private.agent_order_item_is_fully_paid(target_agent_order_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public."order" child_order
    where child_order.parent_order_id = target_agent_order_id
      and child_order.order_kind in ('customer', 'personal')
  )
  and not exists (
    select 1
    from public."order" child_order
    where child_order.parent_order_id = target_agent_order_id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.payment_status <> 'paid'
  );
$$;

alter function private.agent_order_item_is_fully_paid(uuid) owner to postgres;

create or replace function public.compute_order_total(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(
    coalesce(sum(order_item.partial_quantity * order_item.unit_price), 0),
    2
  )
  from public."order" order_row
  left join public.order_item
    on order_item.order_id = order_row.id
    and order_item.order_kind in ('customer', 'personal')
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal')
  group by order_row.id;
$$;

alter function public.compute_order_total(uuid) owner to postgres;

create or replace function public.compute_invoice_total(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(
    coalesce(sum(order_item.final_quantity * order_item.unit_price), 0),
    2
  )
  from public."order" order_row
  left join public.order_item
    on order_item.order_id = order_row.id
    and order_item.order_kind in ('customer', 'personal')
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal')
  group by order_row.id;
$$;

alter function public.compute_invoice_total(uuid) owner to postgres;

create or replace function public.compute_payment_balance(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with order_context as (
    select coalesce(
      order_row.agent_id is not null
      or order_row.parent_order_id is not null
      or order_row.converted_at is not null,
      false
    ) as deduct_commission
    from public."order" order_row
    where order_row.id = target_order_id
      and order_row.order_kind in ('customer', 'personal')
  ),
  commission_total as (
    select round(
      coalesce(
        sum(
          case
            when not coalesce((select deduct_commission from order_context), false) then
              0
            when coalesce(order_item.agent_commission_amount, 0) > 0 then
              order_item.agent_commission_amount
            when product.agent_commission_type = 'percentage' then
              coalesce(order_item.unit_price, product.default_price, 0)
              * coalesce(order_item.final_quantity, 0)
              * coalesce(product.agent_commission_value, 0)
              / 100
            else
              coalesce(order_item.final_quantity, 0)
              * coalesce(product.agent_commission_value, 0)
          end
        ),
        0
      ),
      2
    ) as amount
    from public.order_item
    left join public.product
      on product.id = order_item.product_id
    where order_item.order_id = target_order_id
      and order_item.order_kind in ('customer', 'personal')
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
      order_row.agent_id is not null
      or order_row.parent_order_id is not null
      or order_row.converted_at is not null,
      false
    ) as commission_effective
    from public."order" order_row
    where order_row.id = target_order_id
      and order_row.order_kind in ('customer', 'personal')
  )
  select round(
    coalesce(
      sum(
        case
          when not coalesce((select commission_effective from order_context), false) then
            0
          when coalesce(order_item.agent_commission_amount, 0) > 0 then
            order_item.agent_commission_amount
          else
            coalesce(
              private.calculate_product_agent_commission(
                order_item.product_id,
                order_item.final_quantity,
                order_item.unit_price
              ),
              0
            )
        end
      ),
      0
    ),
    2
  )
  from public.order_item
  where order_item.order_id = target_order_id
    and order_item.order_kind in ('customer', 'personal');
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

create or replace function public.compute_customer_amount_due(target_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(
    greatest(
      coalesce(public.compute_invoice_total(target_order_id), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    ),
    2
  );
$$;

alter function public.compute_customer_amount_due(uuid) owner to postgres;

create or replace function private.derive_payment_status(target_order_id uuid, current_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_payment_balance(target_order_id), 0) as payment_balance
  )
  select case
    when current_status in ('refunded', 'void') then current_status
    when invoice_total <= 0 then 'paid'
    when payment_balance <= 0 then 'paid'
    when payment_total <= 0 then 'unpaid'
    else 'partial'
  end
  from totals;
$$;

alter function private.derive_payment_status(uuid, text) owner to postgres;

create or replace function private.derive_invoice_status(target_order_id uuid, current_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with invoice_row as (
    select invoice.status
    from public.invoice
    where invoice.order_id = target_order_id
    limit 1
  ),
  totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_payment_balance(target_order_id), 0) as payment_balance
    from invoice_row
  )
  select case
    when current_status = 'void' then 'void'
    when invoice_total <= 0 then 'paid'
    when payment_balance <= 0 then 'paid'
    when payment_total > 0 then 'partially_paid'
    when current_status = 'draft' then 'draft'
    else 'issued'
  end
  from totals;
$$;

alter function private.derive_invoice_status(uuid, text) owner to postgres;

create or replace function private.compute_customer_credit_balance(target_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(coalesce(sum(public.compute_payment_balance(order_row.id)), 0), 2)
  from public."order" order_row
  where order_row.customer_id = target_customer_id
    and order_row.order_kind in ('customer', 'personal')
    and order_row.order_status <> 'closed'
    and order_row.payment_status in ('unpaid', 'partial')
    and order_row.converted_at is null;
$$;

alter function private.compute_customer_credit_balance(uuid) owner to postgres;

create or replace function private.refresh_order_financial_status(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_payment_status text;
  next_invoice_status text;
  current_invoice_status text;
begin
  select private.derive_payment_status(target_order_id, order_row.payment_status)
  into next_payment_status
  from public."order" order_row
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal');

  if next_payment_status is not null then
    update public."order"
    set payment_status = next_payment_status,
        updated_at = now()
    where id = target_order_id
      and order_kind in ('customer', 'personal')
      and payment_status is distinct from next_payment_status;
  end if;

  perform private.close_paid_customer_order(target_order_id);

  select invoice.status
  into current_invoice_status
  from public.invoice
  where invoice.order_id = target_order_id
  limit 1;

  if current_invoice_status is not null then
    next_invoice_status := private.derive_invoice_status(target_order_id, current_invoice_status);

    update public.invoice
    set status = next_invoice_status,
        updated_at = now()
    where order_id = target_order_id
      and status is distinct from next_invoice_status;
  end if;
end;
$$;

alter function private.refresh_order_financial_status(uuid) owner to postgres;

create or replace function private.refresh_order_after_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_order_financial_status(new.order_id);
    return new;
  end if;

  perform private.refresh_order_financial_status(old.order_id);
  return old;
end;
$$;

alter function private.refresh_order_after_item_change() owner to postgres;

create or replace function private.refresh_order_after_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.order_status is distinct from new.order_status then
    perform private.refresh_order_financial_status(new.id);
  end if;

  return new;
end;
$$;

alter function private.refresh_order_after_order_status_change() owner to postgres;

create or replace function private.block_referenced_product_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.order_item
    where product_id = old.id
  ) then
    raise exception 'Products referenced by order items cannot be deleted. Deactivate the product instead.';
  end if;

  return old;
end;
$$;

alter function private.block_referenced_product_delete() owner to postgres;

create or replace function public.list_admin_order_rows(
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
  customer_order_totals as (
    select
      order_row.id as order_id,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then order_item.partial_quantity
              else order_item.final_quantity
            end * order_item.unit_price
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
                order_row.agent_id is not null
                or order_row.parent_order_id is not null
                or order_row.converted_at is not null
              ) then
                0
              when coalesce(order_item.agent_commission_amount, 0) > 0 then
                order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    order_item.product_id,
                    case
                      when invoice.id is null then order_item.partial_quantity
                      else order_item.final_quantity
                    end,
                    order_item.unit_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public."order" order_row
    left join public.invoice
      on invoice.order_id = order_row.id
    left join public.order_item
      on order_item.order_id = order_row.id
      and order_item.order_kind in ('customer', 'personal')
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
    group by order_row.id
  ),
  customer_order_paid as (
    select
      order_row.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public."order" order_row
    left join public.payment
      on payment.order_id = order_row.id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
    group by order_row.id
  ),
  distribution_order_totals as (
    select
      distribution_order.id as order_id,
      round(coalesce(sum(order_item.partial_quantity * product.default_price), 0), 2) as total_amount,
      round(
        coalesce(
          sum(
            case
              when coalesce(order_item.agent_commission_amount, 0) > 0 then
                order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    order_item.product_id,
                    order_item.partial_quantity,
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
    from public."order" distribution_order
    left join public.order_item
      on order_item.order_id = distribution_order.id
      and order_item.order_kind = 'distribution'
    left join public.product
      on product.id = order_item.product_id
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_paid as (
    select
      distribution_order.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public."order" distribution_order
    left join public."order" child_order
      on child_order.parent_order_id = distribution_order.id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    left join public.payment
      on payment.order_id = child_order.id
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_payment as (
    select
      distribution_order.id as order_id,
      count(child_order.id)::integer as linked_customer_count,
      count(child_order.id) filter (where child_order.order_status = 'pending')::integer
        as pending_customer_order_count,
      case
        when count(child_order.id) = 0 then 'unpaid'
        when bool_and(child_order.payment_status = 'paid') then 'paid'
        when bool_and(child_order.payment_status = 'unpaid') then 'unpaid'
        else 'partial'
      end as payment_status
    from public."order" distribution_order
    left join public."order" child_order
      on child_order.parent_order_id = distribution_order.id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_customer_search as (
    select
      child_order.parent_order_id as distribution_order_id,
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
    from public."order" child_order
    join public.customer
      on customer.id = child_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where child_order.parent_order_id is not null
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    group by child_order.parent_order_id
  ),
  unified as (
    select
      distribution_order.id,
      'agent'::text as row_type,
      distribution_order.created_at,
      null::date as release_date,
      distribution_order.order_status as status,
      coalesce(agent_person.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      distribution_order_payment.payment_status,
      coalesce(distribution_order_totals.total_amount, 0) as total_amount,
      coalesce(distribution_order_totals.commission_total, 0) as commission_total,
      coalesce(distribution_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(distribution_order_totals.total_amount, 0)
        - coalesce(distribution_order_totals.commission_total, 0)
        - coalesce(distribution_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/agent/' || distribution_order.id::text as href,
      distribution_order_payment.linked_customer_count,
      distribution_order_payment.pending_customer_order_count,
      lower(concat_ws(
        ' ',
        distribution_order.order_status,
        agent_person.display_name,
        agent_person.phone_number,
        distribution_order_customer_search.customer_search_text
      )) as search_text
    from public."order" distribution_order
    join public.agent agent_row
      on agent_row.id = distribution_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join distribution_order_totals
      on distribution_order_totals.order_id = distribution_order.id
    left join distribution_order_payment
      on distribution_order_payment.order_id = distribution_order.id
    left join distribution_order_paid
      on distribution_order_paid.order_id = distribution_order.id
    left join distribution_order_customer_search
      on distribution_order_customer_search.distribution_order_id = distribution_order.id
    where distribution_order.order_kind = 'distribution'

    union all

    select
      order_row.id,
      'customer'::text as row_type,
      order_row.created_at,
      order_row.release_date,
      order_row.order_status as status,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      order_row.source,
      case order_row.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(order_row.source, '_', ' '))
      end as source_label,
      order_row.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      coalesce(customer_order_totals.commission_total, 0) as commission_total,
      coalesce(customer_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(customer_order_totals.total_amount, 0)
        - coalesce(customer_order_totals.commission_total, 0)
        - coalesce(customer_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/customer/' || order_row.id::text as href,
      null::integer as linked_customer_count,
      null::integer as pending_customer_order_count,
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
        agent_person.display_name
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
    left join customer_order_totals
      on customer_order_totals.order_id = order_row.id
    left join customer_order_paid
      on customer_order_paid.order_id = order_row.id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.parent_order_id is null
      and order_row.converted_at is null
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

create or replace function public.list_admin_invoice_rows(
  search_query text default null,
  balance_status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
)
returns table(records jsonb, total_rows bigint)
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
      order_row.id as order_id,
      invoice.id as invoice_id,
      invoice.invoice_number,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      invoice.created_at as invoice_created_at,
      coalesce(public.compute_invoice_total(order_row.id), 0) as invoice_total,
      coalesce(public.compute_payment_total(order_row.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(order_row.id), 0) as balance,
      order_row.payment_status,
      lower(concat_ws(
        ' ',
        invoice.invoice_number,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email
      )) as search_text
    from public."order" order_row
    join public.invoice
      on invoice.order_id = order_row.id
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
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

create or replace function public.list_admin_activity_rows(
  search_query text default null,
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
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  unified as (
    select
      'order-created:' || order_row.id::text as id,
      'order'::text as category,
      'Created order'::text as title,
      'Order ' || left(order_row.id::text, 8) || ' for ' || concat_ws(' ', customer_person.first_name, customer_person.last_name) as detail,
      order_row.created_at as occurred_at
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where order_row.order_kind in ('customer', 'personal')

    union all

    select
      'order-updated:' || order_row.id::text,
      'order',
      'Updated order',
      'Order ' || left(order_row.id::text, 8) || ' is ' || order_row.order_status || ' with payment ' || order_row.payment_status,
      order_row.updated_at
    from public."order" order_row
    where order_row.order_kind in ('customer', 'personal')
      and order_row.updated_at > order_row.created_at

    union all

    select
      'agent-order-created:' || distribution_order.id::text,
      'order',
      'Created agent order',
      'Agent order ' || left(distribution_order.id::text, 8) || ' for ' || coalesce(agent_person.display_name, 'Agent'),
      distribution_order.created_at
    from public."order" distribution_order
    join public.agent agent_row
      on agent_row.id = distribution_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    where distribution_order.order_kind = 'distribution'

    union all

    select
      'order-status:' || order_status_history.id::text,
      'order',
      'Updated order status',
      'Order ' || left(order_status_history.order_id::text, 8) || ' moved from ' || coalesce(order_status_history.from_status, 'new') || ' to ' || order_status_history.to_status,
      order_status_history.changed_at
    from public.order_status_history

    union all

    select
      'customer-created:' || customer.id::text,
      'customer',
      'Added new customer',
      concat_ws(' ', customer_person.first_name, customer_person.last_name) || case when customer.is_reseller then ' - reseller' else '' end,
      customer.created_at
    from public.customer
    join public.profile customer_person
      on customer_person.id = customer.profile_id

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
      page.title || ' is ' || page.status,
      page.updated_at
    from public.page
    where page.updated_at > page.created_at
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where normalized.search_value is null
      or lower(unified.title || ' ' || unified.detail) like '%' || normalized.search_value || '%'
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
      jsonb_agg(to_jsonb(paged) - 'total_rows' order by paged.occurred_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_activity_rows(text, integer, integer) owner to postgres;

create or replace function public.get_customer_orders_by_tracking_number(
  p_tracking_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_tracking_number text;
  resolved_customer_id uuid;
  orders_payload jsonb;
  total_amount_due numeric;
begin
  normalized_tracking_number := upper(trim(coalesce(p_tracking_number, '')));

  if normalized_tracking_number !~ '^JHM-[A-Z2-9]{8}$' then
    return null;
  end if;

  select customer.id
  into resolved_customer_id
  from public.customer
  where customer.tracking_number = normalized_tracking_number;

  if resolved_customer_id is null then
    return null;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', order_row.id,
          'orderStatus', order_row.order_status,
          'paymentStatus', order_row.payment_status,
          'source', order_row.source,
          'createdAt', order_row.created_at,
          'orderTotal', coalesce(public.compute_invoice_total(order_row.id), 0),
          'amountDue', coalesce(public.compute_customer_amount_due(order_row.id), 0),
          'items', coalesce(order_items.items, '[]'::jsonb)
        )
        order by order_row.created_at desc
      ),
      '[]'::jsonb
    ),
    coalesce(
      sum(coalesce(public.compute_customer_amount_due(order_row.id), 0)),
      0
    )
  into orders_payload, total_amount_due
  from public."order" order_row
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'productName', product.name,
        'quantity', order_item.final_quantity,
        'unitLabel', product.unit_label,
        'addDetails', order_item.add_details
      )
      order by product.name
    ) as items
    from public.order_item
    join public.product
      on product.id = order_item.product_id
    where order_item.order_id = order_row.id
      and order_item.order_kind in ('customer', 'personal')
  ) as order_items
    on true
  where order_row.customer_id = resolved_customer_id
    and order_row.order_kind in ('customer', 'personal');

  return jsonb_build_object(
    'trackingNumber', normalized_tracking_number,
    'totalAmountDue', round(coalesce(total_amount_due, 0), 2),
    'orders', orders_payload
  );
end;
$$;

alter function public.get_customer_orders_by_tracking_number(text) owner to postgres;
