begin;

do $$
declare
  test_product_id uuid;
  test_customer_profile_id uuid;
  test_customer_id uuid;
  test_agent_profile_id uuid;
  test_agent_id uuid;
  test_order_id uuid;
  test_item_id uuid;
  test_invoice_id uuid;
  reseller_customer_profile_id uuid;
  reseller_customer_id uuid;
  reseller_order_id uuid;
  reseller_item_id uuid;
  blocked boolean;
  numeric_result numeric;
  text_result text;
  row_count integer;
  timestamp_result timestamptz;
  tracking_lookup jsonb;
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

  insert into public.profile (
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
  returning id into test_customer_profile_id;

  insert into public.customer (
    profile_id
  )
  values (
    test_customer_profile_id
  )
  returning id into test_customer_id;

  insert into public.profile (
    first_name,
    last_name,
    phone_number,
    address
  )
  values (
    'Phase',
    'Four Agent',
    '0000000001',
    'Temporary agent address'
  )
  returning id into test_agent_profile_id;

  insert into public.agent (
    profile_id,
    status
  )
  values (
    test_agent_profile_id,
    'active'
  )
  returning id into test_agent_id;

  insert into public.customer_order (
    customer_id,
    agent_id,
    source,
    order_status
  )
  values (
    test_customer_id,
    test_agent_id,
    'admin_manual',
    'pending'
  )
  returning id into test_order_id;

  update public.customer_order
  set order_status = 'processing'
  where id = test_order_id;

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    agent_commission_amount,
    agent_commission_paid
  )
  values (
    test_order_id,
    test_product_id,
    2,
    999,
    80,
    false
  )
  returning id into test_item_id;

  select final_quantity
  into numeric_result
  from public.customer_order_item
  where id = test_item_id;

  if numeric_result <> 2 then
    raise exception 'Expected inserted final_quantity to copy partial_quantity, got %', numeric_result;
  end if;

  select unit_price
  into numeric_result
  from public.customer_order_item
  where id = test_item_id;

  if numeric_result <> 100 then
    raise exception 'Expected retail customer item to use retail unit price 100, got %', numeric_result;
  end if;

  select price_type
  into text_result
  from public.customer_order_item
  where id = test_item_id;

  if text_result <> 'retail' then
    raise exception 'Expected retail customer item price type retail, got %', text_result;
  end if;

  select public.compute_order_total(test_order_id)
  into numeric_result;

  if numeric_result <> 200 then
    raise exception 'Expected order total 200 from partial quantity, got %', numeric_result;
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

  if numeric_result <> 400 then
    raise exception 'Expected invoice total 400 from final quantity, got %', numeric_result;
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

  insert into public.invoice (order_id)
  values (test_order_id)
  returning id into test_invoice_id;

  select status, issued_at
  into text_result, timestamp_result
  from public.invoice
  where id = test_invoice_id;

  if text_result <> 'issued' then
    raise exception 'Expected default invoice status issued, got %', text_result;
  end if;

  if timestamp_result is null then
    raise exception 'Expected invoice issued_at to default automatically';
  end if;

  blocked := false;
  begin
    update public.invoice
    set status = 'overdue'
    where id = test_invoice_id;
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Expected overdue invoice status to be blocked';
  end if;

  blocked := false;
  begin
    update public.invoice
    set status = 'void'
    where id = test_invoice_id;
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Expected void invoice status to be blocked';
  end if;

  select public.compute_payment_balance(test_order_id)
  into numeric_result;

  if numeric_result <> 320 then
    raise exception 'Expected commission-adjusted unpaid balance 320, got %', numeric_result;
  end if;

  select public.compute_customer_amount_due(test_order_id)
  into numeric_result;

  if numeric_result <> 400 then
    raise exception 'Expected customer amount due 400 without commission deduction, got %', numeric_result;
  end if;

  select public.get_customer_orders_by_tracking_number(customer.tracking_number)
  into tracking_lookup
  from public.customer
  where customer.id = test_customer_id;

  if coalesce((tracking_lookup -> 'orders' -> 0 ->> 'amountDue')::numeric, -1) <> 400 then
    raise exception 'Expected tracking amount due 400 without commission deduction, got %',
      tracking_lookup -> 'orders' -> 0 ->> 'amountDue';
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
    payment_terms,
    reference_number
  )
  values (
    test_order_id,
    197.50,
    'Cash',
    'Cash on Delivery (COD)',
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

  if numeric_result <> 122.50 then
    raise exception 'Expected balance 122.50 after first payment, got %', numeric_result;
  end if;

  select public.compute_earned_commission(test_order_id)
  into numeric_result;

  if numeric_result <> 49.38 then
    raise exception 'Expected earned commission 49.38 after partial payment, got %', numeric_result;
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
    payment_terms,
    reference_number
  )
  values (
    test_order_id,
    122.50,
    'Cash',
    'Cash on Delivery (COD)',
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

  insert into public.profile (
    first_name,
    last_name,
    phone_number,
    address
  )
  values (
    'Phase',
    'Reseller',
    '09990000000',
    'Temporary reseller address'
  )
  returning id into reseller_customer_profile_id;

  insert into public.customer (
    profile_id,
    is_reseller
  )
  values (
    reseller_customer_profile_id,
    true
  )
  returning id into reseller_customer_id;

  insert into public.customer_order (
    customer_id,
    source,
    order_status
  )
  values (
    reseller_customer_id,
    'admin_manual',
    'processing'
  )
  returning id into reseller_order_id;

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity
  )
  values (
    reseller_order_id,
    test_product_id,
    2,
    2
  )
  returning id into reseller_item_id;

  select unit_price
  into numeric_result
  from public.customer_order_item
  where id = reseller_item_id;

  if numeric_result <> 80 then
    raise exception 'Expected reseller customer item to use reseller unit price 80, got %', numeric_result;
  end if;

  select price_type
  into text_result
  from public.customer_order_item
  where id = reseller_item_id;

  if text_result <> 'reseller' then
    raise exception 'Expected reseller customer item price type reseller, got %', text_result;
  end if;

  select public.compute_order_total(reseller_order_id)
  into numeric_result;

  if numeric_result <> 160 then
    raise exception 'Expected reseller order total 160, got %', numeric_result;
  end if;

  insert into public.customer_order (
    customer_id,
    source,
    order_status
  )
  values (
    test_customer_id,
    'admin_manual',
    'processing'
  )
  returning id into reseller_order_id;

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity
  )
  values (
    reseller_order_id,
    test_product_id,
    1,
    1
  );

  update public.customer_order
  set order_status = 'closed'
  where id = reseller_order_id;

  select payment_status
  into text_result
  from public.customer_order
  where id = reseller_order_id;

  if text_result <> 'unpaid' then
    raise exception 'Expected unpaid closed order payment status unpaid, got %', text_result;
  end if;

  insert into public.customer_order (
    customer_id,
    source,
    order_status
  )
  values (
    test_customer_id,
    'admin_manual',
    'processing'
  )
  returning id into reseller_order_id;

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity
  )
  values (
    reseller_order_id,
    test_product_id,
    1,
    1
  );

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    payment_terms,
    reference_number
  )
  values (
    reseller_order_id,
    25,
    'Cash',
    'Cash on Delivery (COD)',
    'phase-4-cancelled-refund'
  );

  update public.customer_order
  set order_status = 'closed'
  where id = reseller_order_id;

  select payment_status
  into text_result
  from public.customer_order
  where id = reseller_order_id;

  if text_result <> 'partial' then
    raise exception 'Expected partially paid closed order payment status partial, got %', text_result;
  end if;

  blocked := false;
  begin
    update public.customer_order
    set order_status = 'pending'
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
