update public.customer_order
set
  order_status = 'closed',
  updated_at = now()
where order_status is distinct from 'closed'
  and payment_status = 'paid'
  and exists (
    select 1
    from public.invoice
    where invoice.order_id = customer_order.id
  );

update public.agent_order
set
  order_status = 'closed',
  updated_at = now()
where order_status is distinct from 'closed'
  and exists (
    select 1
    from public.customer_order
    where customer_order.agent_order_id = agent_order.id
  )
  and not exists (
    select 1
    from public.customer_order
    where customer_order.agent_order_id = agent_order.id
      and customer_order.payment_status is distinct from 'paid'
  );
