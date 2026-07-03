create or replace function public.submit_agent_order(
  target_customer_id uuid,
  item_payload jsonb,
  delivery_fee_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_agent_id uuid;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select id
  into current_agent_id
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
  end if;

  if delivery_fee_amount is null or delivery_fee_amount < 0 then
    raise exception 'Delivery fee must be a non-negative amount.';
  end if;

  if not exists (
    select 1
    from public.customer
    where id = target_customer_id
      and assigned_agent_id = current_agent_id
  ) then
    raise exception 'Selected customer is not assigned to this agent.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  insert into public.customer_order (
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    discount_amount,
    delivery_fee,
    submitted_by
  )
  values (
    target_customer_id,
    current_agent_id,
    'agent_submitted',
    'submitted',
    'unpaid',
    0,
    delivery_fee_amount,
    (select auth.uid())
  )
  returning id into inserted_order_id;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for agent ordering.', item_product_id;
    end if;

    insert into public.customer_order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details
    )
    values (
      inserted_order_id,
      item_product_id,
      item_quantity,
      item_quantity,
      item_details
    );
  end loop;

  if not exists (
    select 1
    from public.customer_order_item
    where order_id = inserted_order_id
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Agent order payload contains an invalid product id or quantity.';
end;
$$;

revoke all on function public.submit_agent_order(uuid, jsonb, numeric) from public;
revoke execute on function public.submit_agent_order(uuid, jsonb, numeric) from anon;
revoke execute on function public.submit_agent_order(uuid, jsonb, numeric) from authenticated;
grant execute on function public.submit_agent_order(uuid, jsonb, numeric) to authenticated;
