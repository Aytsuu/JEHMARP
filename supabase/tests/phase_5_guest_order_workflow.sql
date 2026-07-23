begin;

do $$
declare
  test_product_id uuid;
  test_order_id uuid;
  inserted_customer_id uuid;
  item_count integer;
  numeric_result numeric;
  text_result text;
  tracking_lookup jsonb;
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
  from public."order"
  where id = test_order_id
    and order_kind = 'customer'
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
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where customer.id = inserted_customer_id
      and customer_person.first_name = 'Guest'
      and customer_person.last_name = 'Buyer'
      and customer_person.phone_number = '09170000000'
      and customer_person.email = 'guest@example.com'
      and customer_person.address = 'Temporary public order address'
      and customer.assigned_agent_id is null
      and customer.is_reseller = false
      and customer.tracking_number ~ '^JHM-[A-HJ-NP-Z2-9]{8}$'
  ) then
    raise exception 'Expected guest customer record to be inserted with tracking number';
  end if;

  select count(*)
  into item_count
  from public.order_item
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
  from public.order_item
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

  select public.get_customer_orders_by_tracking_number(customer.tracking_number)
  into tracking_lookup
  from public.customer
  where customer.id = inserted_customer_id;

  if tracking_lookup is null or jsonb_array_length(tracking_lookup -> 'orders') <> 1 then
    raise exception 'Expected tracking lookup to return one guest order';
  end if;

  if coalesce((tracking_lookup ->> 'totalAmountDue')::numeric, -1) <> 300 then
    raise exception 'Expected tracking lookup total amount due to be 300, got %',
      tracking_lookup ->> 'totalAmountDue';
  end if;

  if coalesce((tracking_lookup -> 'orders' -> 0 ->> 'orderTotal')::numeric, -1) <> 300 then
    raise exception 'Expected tracking lookup order total to be 300, got %',
      tracking_lookup -> 'orders' -> 0 ->> 'orderTotal';
  end if;

  if coalesce((tracking_lookup -> 'orders' -> 0 ->> 'amountDue')::numeric, -1) <> 300 then
    raise exception 'Expected tracking lookup amount due to be 300, got %',
      tracking_lookup -> 'orders' -> 0 ->> 'amountDue';
  end if;
end $$;

rollback;
