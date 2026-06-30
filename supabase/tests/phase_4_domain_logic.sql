begin;

do $$
declare
  test_product_id uuid;
  test_customer_id uuid;
  test_order_id uuid;
  test_item_id uuid;
  test_invoice_id uuid;
  blocked boolean;
  numeric_result numeric;
  text_result text;
  row_count integer;
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
    'Phase 4 Test Product',
    'pork',
    'kg',
    100,
    80,
    'in_stock',
    true
  )
  returning id into test_product_id;

  insert into public.customer (
    first_name,
    last_name,
    phone_number,
    address
  )
  values (
    'Phase',
    'Four',
    '0000000000',
    'Temporary test address'
  )
  returning id into test_customer_id;

  insert into public.customer_order (
    customer_id,
    source,
    order_status,
    discount_amount,
    delivery_fee
  )
  values (
    test_customer_id,
    'admin_manual',
    'draft',
    10,
    5
  )
  returning id into test_order_id;

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    agent_commission_amount,
    agent_commission_status
  )
  values (
    test_order_id,
    test_product_id,
    2,
    999,
    80,
    'set'
  )
  returning id into test_item_id;

  select final_quantity
  into numeric_result
  from public.customer_order_item
  where id = test_item_id;

  if numeric_result <> 2 then
    raise exception 'Expected inserted final_quantity to copy partial_quantity, got %', numeric_result;
  end if;

  select public.compute_order_total(test_order_id)
  into numeric_result;

  if numeric_result <> 195 then
    raise exception 'Expected order total 195 from partial quantity, got %', numeric_result;
  end if;

  update public.customer_order_item
  set final_quantity = 4
  where id = test_item_id;

  select partial_quantity
  into numeric_result
  from public.customer_order_item
  where id = test_item_id;

  if numeric_result <> 2 then
    raise exception 'Expected final_quantity update not to change partial_quantity, got %', numeric_result;
  end if;

  select public.compute_invoice_total(test_order_id)
  into numeric_result;

  if numeric_result <> 395 then
    raise exception 'Expected invoice total 395 from final quantity, got %', numeric_result;
  end if;

  update public.customer_order_item
  set partial_quantity = 3
  where id = test_item_id;

  select final_quantity
  into numeric_result
  from public.customer_order_item
  where id = test_item_id;

  if numeric_result <> 3 then
    raise exception 'Expected partial_quantity update to copy into final_quantity, got %', numeric_result;
  end if;

  update public.customer_order_item
  set final_quantity = 4
  where id = test_item_id;

  insert into public.invoice (order_id, status)
  values (test_order_id, 'draft')
  returning id into test_invoice_id;

  select public.compute_payment_balance(test_order_id)
  into numeric_result;

  if numeric_result <> 395 then
    raise exception 'Expected unpaid balance 395, got %', numeric_result;
  end if;

  select payment_status
  into text_result
  from public.customer_order
  where id = test_order_id;

  if text_result <> 'unpaid' then
    raise exception 'Expected unpaid payment status before payments, got %', text_result;
  end if;

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    reference_number
  )
  values (
    test_order_id,
    197.50,
    'cash',
    'phase-4-payment-1'
  );

  select payment_status
  into text_result
  from public.customer_order
  where id = test_order_id;

  if text_result <> 'partial' then
    raise exception 'Expected partial payment status after first payment, got %', text_result;
  end if;

  select status
  into text_result
  from public.invoice
  where id = test_invoice_id;

  if text_result <> 'partially_paid' then
    raise exception 'Expected partially_paid invoice after first payment, got %', text_result;
  end if;

  select public.compute_payment_balance(test_order_id)
  into numeric_result;

  if numeric_result <> 197.50 then
    raise exception 'Expected balance 197.50 after first payment, got %', numeric_result;
  end if;

  select public.compute_earned_commission(test_order_id)
  into numeric_result;

  if numeric_result <> 40 then
    raise exception 'Expected earned commission 40 after half payment, got %', numeric_result;
  end if;

  blocked := false;
  begin
    update public.payment
    set amount = 200
    where order_id = test_order_id;
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Expected payment updates to be blocked';
  end if;

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    reference_number
  )
  values (
    test_order_id,
    197.50,
    'cash',
    'phase-4-payment-2'
  );

  select payment_status
  into text_result
  from public.customer_order
  where id = test_order_id;

  if text_result <> 'paid' then
    raise exception 'Expected paid payment status after full payment, got %', text_result;
  end if;

  select status
  into text_result
  from public.invoice
  where id = test_invoice_id;

  if text_result <> 'paid' then
    raise exception 'Expected paid invoice after full payment, got %', text_result;
  end if;

  select public.compute_payment_balance(test_order_id)
  into numeric_result;

  if numeric_result <> 0 then
    raise exception 'Expected zero balance after full payment, got %', numeric_result;
  end if;

  select public.compute_expected_commission(test_order_id)
  into numeric_result;

  if numeric_result <> 80 then
    raise exception 'Expected expected commission 80, got %', numeric_result;
  end if;

  select public.compute_earned_commission(test_order_id)
  into numeric_result;

  if numeric_result <> 80 then
    raise exception 'Expected earned commission 80 after full payment, got %', numeric_result;
  end if;

  update public.customer_order
  set order_status = 'submitted'
  where id = test_order_id;

  blocked := false;
  begin
    update public.customer_order
    set order_status = 'fulfilled'
    where id = test_order_id;
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Expected invalid order status transition to be blocked';
  end if;

  select count(*)
  into row_count
  from public.customer_order_status_history
  where order_id = test_order_id;

  if row_count < 2 then
    raise exception 'Expected order status history rows, got %', row_count;
  end if;

  select count(*)
  into row_count
  from public.customer_order_update
  where order_id = test_order_id;

  if row_count < 3 then
    raise exception 'Expected order update timeline rows, got %', row_count;
  end if;

  blocked := false;
  begin
    delete from public.product
    where id = test_product_id;
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Expected deleting a referenced product to be blocked';
  end if;

  perform public.deactivate_product(test_product_id);

  select is_active::text
  into text_result
  from public.product
  where id = test_product_id;

  if text_result <> 'false' then
    raise exception 'Expected deactivate_product to mark product inactive, got %', text_result;
  end if;

end $$;

rollback;
