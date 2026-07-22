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
      or customer_order.converted_to_agent_order_id is not null
      or customer.promoted_to_agent_id is not null,
      false
    ) as deduct_commission
    from public.customer_order
    left join public.customer
      on customer.id = customer_order.customer_id
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
  select round(coalesce(sum(public.compute_payment_balance(customer_order.id)), 0), 2)
  from public.customer_order
  where customer_order.customer_id = target_customer_id
    and customer_order.order_status <> 'closed'
    and customer_order.payment_status in ('unpaid', 'partial')
    and customer_order.converted_to_agent_order_id is null;
$$;

alter function private.compute_customer_credit_balance(uuid) owner to postgres;

revoke all on function public.compute_payment_balance(uuid) from public;
grant execute on function public.compute_payment_balance(uuid) to authenticated;
grant execute on function public.compute_payment_balance(uuid) to service_role;

revoke all on function private.derive_payment_status(uuid, text) from public;
grant execute on function private.derive_payment_status(uuid, text) to service_role;

revoke all on function private.derive_invoice_status(uuid, text) from public;
grant execute on function private.derive_invoice_status(uuid, text) to service_role;

revoke all on function private.compute_customer_credit_balance(uuid) from public;
grant execute on function private.compute_customer_credit_balance(uuid) to service_role;
