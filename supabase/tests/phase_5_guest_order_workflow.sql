begin;

do $$
declare
  test_product_id uuid;
  test_order_id uuid;
  inserted_customer_id uuid;
  item_count integer;
  numeric_result numeric;
  text_result text;
  blocked boolean;
  can_anon_execute boolean;
begin
  insert into public.product (
    name,
    category,
    unit_label,
    default_price,
    reseller_price,
    stock_status,
    is_active
  )
  values (
    'Phase 5 Public Product',
    'chicken',
    'kg',
    150,
    120,
    'in_stock',
    true
  )
  returning id into test_product_id;

  select public.submit_guest_order(
    jsonb_build_object(
      'firstName', 'Guest',
      'lastName', 'Buyer',
      'phoneNumber', '09170000000',
      'email', 'guest@example.com',
      'address', 'Temporary public order address'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'productId', test_product_id,
        'quantity', 2,
        'addDetails', 'Cut into portions'
      )
    )
  )
  into test_order_id;

  if test_order_id is null then
    raise exception 'Expected submit_guest_order to return an order id';
  end if;

  select customer_id
  into inserted_customer_id
  from public.customer_order
  where id = test_order_id
    and source = 'guest_shop'
    and order_status = 'pending'
    and payment_status = 'unpaid'
    and agent_id is null
    and submitted_by is null;

  if inserted_customer_id is null then
    raise exception 'Expected guest order to be inserted with guest defaults';
  end if;

  if not exists (
    select 1
    from public.customer
    where id = inserted_customer_id
      and first_name = 'Guest'
      and last_name = 'Buyer'
      and phone_number = '09170000000'
      and email = 'guest@example.com'
      and address = 'Temporary public order address'
      and assigned_agent_id is null
      and is_reseller = false
  ) then
    raise exception 'Expected guest customer record to be inserted';
  end if;

  select count(*)
  into item_count
  from public.customer_order_item
  where order_id = test_order_id
    and product_id = test_product_id
    and partial_quantity = 2
    and final_quantity = 2
    and add_details = 'Cut into portions';

  if item_count <> 1 then
    raise exception 'Expected one guest order item with synced quantities, got %', item_count;
  end if;

  select unit_price, price_type
  into numeric_result, text_result
  from public.customer_order_item
  where order_id = test_order_id
    and product_id = test_product_id;

  if numeric_result <> 150 or text_result <> 'retail' then
    raise exception 'Expected guest order item to use retail price 150, got % type %', numeric_result, text_result;
  end if;

  blocked := false;
  begin
    perform public.submit_guest_order(
      jsonb_build_object(
        'firstName', 'Guest',
        'lastName', 'Buyer',
        'phoneNumber', '09170000000',
        'address', 'Temporary public order address'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'productId', test_product_id,
          'quantity', 0
        )
      )
    );
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Expected zero quantity guest order item to be rejected';
  end if;

  select has_function_privilege('anon', 'public.submit_guest_order(jsonb, jsonb)', 'execute')
  into can_anon_execute;

  if can_anon_execute then
    raise exception 'anon must not execute the trusted guest order function directly';
  end if;
end $$;

rollback;
