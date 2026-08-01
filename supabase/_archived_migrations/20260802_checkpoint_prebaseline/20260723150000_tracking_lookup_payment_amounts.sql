-- Expose order totals and remaining balances on public tracking lookups.

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
          'id', customer_order.id,
          'orderStatus', customer_order.order_status,
          'paymentStatus', customer_order.payment_status,
          'source', customer_order.source,
          'createdAt', customer_order.created_at,
          'orderTotal', coalesce(public.compute_invoice_total(customer_order.id), 0),
          'amountDue', coalesce(public.compute_payment_balance(customer_order.id), 0),
          'items', coalesce(order_items.items, '[]'::jsonb)
        )
        order by customer_order.created_at desc
      ),
      '[]'::jsonb
    ),
    coalesce(
      sum(coalesce(public.compute_payment_balance(customer_order.id), 0)),
      0
    )
  into orders_payload, total_amount_due
  from public.customer_order
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'productName', product.name,
        'quantity', customer_order_item.final_quantity,
        'unitLabel', product.unit_label,
        'addDetails', customer_order_item.add_details
      )
      order by product.name
    ) as items
    from public.customer_order_item
    join public.product
      on product.id = customer_order_item.product_id
    where customer_order_item.order_id = customer_order.id
  ) as order_items
    on true
  where customer_order.customer_id = resolved_customer_id;

  return jsonb_build_object(
    'trackingNumber', normalized_tracking_number,
    'totalAmountDue', round(coalesce(total_amount_due, 0), 2),
    'orders', orders_payload
  );
end;
$$;

alter function public.get_customer_orders_by_tracking_number(text) owner to postgres;

revoke all on function public.get_customer_orders_by_tracking_number(text) from public;
grant execute on function public.get_customer_orders_by_tracking_number(text) to service_role;
