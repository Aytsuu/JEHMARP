begin;

do $$
declare
  seeded_at timestamptz := '2026-07-21T06:00:00Z'::timestamptz;
  admin_user_id uuid := '10101010-0000-4000-8000-000000000001';
  promoted_profile_id uuid := '10101010-0000-4000-8000-000000000091';
  promoted_customer_id uuid := '10101010-0000-4000-8000-000000000011';
  agent_user_id uuid := '10101010-0000-4000-8000-000000000002';
  target_agent_id uuid := '10101010-0000-4000-8000-000000000012';
  product_id uuid := '10101010-0000-4000-8000-000000000020';
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      admin_user_id,
      'authenticated',
      'authenticated',
      'phase10-admin@example.test',
      crypt('phase10-admin-password', gen_salt('bf')),
      seeded_at,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      seeded_at,
      seeded_at
    ),
    (
      agent_user_id,
      'authenticated',
      'authenticated',
      'phase10-agent@example.test',
      crypt('phase10-agent-password', gen_salt('bf')),
      seeded_at,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      seeded_at,
      seeded_at
    );

  insert into public.admin_role (user_id, role, status, created_at, updated_at)
  values (admin_user_id, 'admin', 'active', seeded_at, seeded_at);

  insert into public.profile (id, user_id, first_name, last_name, display_name, phone_number, email, address, created_at, updated_at)
  values
    (agent_user_id, agent_user_id, 'Phase', 'Ten Agent', 'Phase Ten Agent', '09171000002', 'phase10-agent@example.test', 'Agent Address', seeded_at, seeded_at),
    (promoted_profile_id, null, 'Phase', 'Ten Customer', 'Phase Ten Customer', '09171000011', 'phase10-customer@example.test', 'Customer Address', seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000092', null, 'Phase', 'Ten Regular', 'Phase Ten Regular', '09171000012', null, 'Regular Address', seeded_at, seeded_at);

  insert into public.product (
    id,
    name,
    category,
    unit_label,
    default_price,
    reseller_price,
    agent_commission_type,
    agent_commission_value,
    stock_status,
    is_active
  )
  values (
    product_id,
    'Phase 10 Product',
    'pork',
    'kg',
    100,
    80,
    'value',
    20,
    'in_stock',
    true
  );

  insert into public.agent (
    id,
    user_id,
    profile_id,
    status,
    promoted_from_customer_id,
    promoted_from_customer_at,
    created_at,
    updated_at
  )
  values (
    target_agent_id,
    agent_user_id,
    agent_user_id,
    'active',
    promoted_customer_id,
    seeded_at,
    seeded_at,
    seeded_at
  );

  insert into public.customer (
    id,
    profile_id,
    assigned_agent_id,
    promoted_to_agent_id,
    promoted_to_agent_at,
    created_at,
    updated_at
  )
  values
    (promoted_customer_id, promoted_profile_id, target_agent_id, target_agent_id, seeded_at, seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000013', '10101010-0000-4000-8000-000000000092', target_agent_id, null, null, seeded_at, seeded_at);

  insert into public.customer_order (
    id,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    notes,
    submitted_by,
    created_at,
    updated_at
  )
  values
    ('10101010-0000-4000-8000-000000000101', promoted_customer_id, null, 'admin_manual', 'processing', 'unpaid', 'Needs distribution stock.', admin_user_id, seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000102', promoted_customer_id, null, 'admin_manual', 'processing', 'partial', null, admin_user_id, seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000103', promoted_customer_id, null, 'admin_manual', 'processing', 'unpaid', null, admin_user_id, seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000104', promoted_customer_id, null, 'admin_manual', 'closed', 'unpaid', null, admin_user_id, seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000105', '10101010-0000-4000-8000-000000000013', null, 'admin_manual', 'processing', 'unpaid', null, admin_user_id, seeded_at, seeded_at),
    ('10101010-0000-4000-8000-000000000106', promoted_customer_id, target_agent_id, 'admin_manual', 'processing', 'unpaid', null, admin_user_id, seeded_at, seeded_at);

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    agent_commission_amount,
    add_details
  )
  values
    ('10101010-0000-4000-8000-000000000101', product_id, 3.000, 3.000, 45.00, 'Copy me'),
    ('10101010-0000-4000-8000-000000000102', product_id, 1.000, 1.000, 0, null),
    ('10101010-0000-4000-8000-000000000103', product_id, 1.000, 1.000, 0, null),
    ('10101010-0000-4000-8000-000000000104', product_id, 1.000, 1.000, 0, null),
    ('10101010-0000-4000-8000-000000000105', product_id, 1.000, 1.000, 0, null),
    ('10101010-0000-4000-8000-000000000106', product_id, 3.000, 3.000, 0, null);

  insert into public.invoice (order_id)
  values
    ('10101010-0000-4000-8000-000000000103'),
    ('10101010-0000-4000-8000-000000000106');

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    payment_terms,
    reference_number
  )
  values (
    '10101010-0000-4000-8000-000000000102',
    20,
    'Cash',
    'Cash on Delivery (COD)',
    'phase-10-partial-payment'
  ),
  (
    '10101010-0000-4000-8000-000000000106',
    240,
    'Cash',
    'Cash on Delivery (COD)',
    'phase-10-net-paid-payment'
  );
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10101010-0000-4000-8000-000000000001', true);

do $$
declare
  converted_agent_order_id uuid;
  copied_quantity numeric;
  copied_details text;
  copied_commission numeric;
  blocked boolean;
begin
  converted_agent_order_id := public.convert_customer_order_to_agent_distribution_order(
    '10101010-0000-4000-8000-000000000101'
  );

  if converted_agent_order_id is null then
    raise exception 'Expected conversion RPC to return the new agent order id.';
  end if;

  if not exists (
    select 1
    from public.agent_order
    where id = converted_agent_order_id
      and agent_id = '10101010-0000-4000-8000-000000000012'
      and order_status = 'pending_customers'
      and notes like '%Converted from customer order 10101010-0000-4000-8000-000000000101%'
  ) then
    raise exception 'Expected a pending agent order linked to the promoted agent.';
  end if;

  select quantity, add_details, agent_commission_amount
  into copied_quantity, copied_details, copied_commission
  from public.agent_order_item
  where agent_order_id = converted_agent_order_id
    and product_id = '10101010-0000-4000-8000-000000000020';

  if copied_quantity <> 3.000 or copied_details <> 'Copy me' or copied_commission <> 45.00 then
    raise exception 'Expected converted agent item quantity/details/commission 3.000/Copy me/45.00, got %/%/%',
      copied_quantity,
      copied_details,
      copied_commission;
  end if;

  if not exists (
    select 1
    from public.customer_order
    where id = '10101010-0000-4000-8000-000000000101'
      and converted_to_agent_order_id = converted_agent_order_id
      and converted_to_agent_order_at is not null
      and converted_to_agent_order_by = '10101010-0000-4000-8000-000000000001'
      and agent_order_id is null
  ) then
    raise exception 'Expected source customer order to keep its original link and store conversion audit metadata.';
  end if;

  blocked := false;
  begin
    perform public.convert_customer_order_to_agent_distribution_order('10101010-0000-4000-8000-000000000101');
  exception
    when others then blocked := true;
  end;
  if not blocked then
    raise exception 'Expected duplicate conversion to be blocked.';
  end if;

  blocked := false;
  begin
    perform public.convert_customer_order_to_agent_distribution_order('10101010-0000-4000-8000-000000000102');
  exception
    when others then blocked := true;
  end;
  if not blocked then
    raise exception 'Expected paid/partial customer order to be blocked.';
  end if;

  converted_agent_order_id := public.convert_customer_order_to_agent_distribution_order(
    '10101010-0000-4000-8000-000000000103'
  );

  if converted_agent_order_id is null then
    raise exception 'Expected invoice-only customer order conversion RPC to return the new agent order id.';
  end if;

  if not exists (
    select 1
    from public.agent_order
    where id = converted_agent_order_id
      and agent_id = '10101010-0000-4000-8000-000000000012'
      and order_status = 'pending_customers'
  ) then
    raise exception 'Expected invoice-only customer order to convert into pending customer distribution.';
  end if;

  blocked := false;
  begin
    perform public.convert_customer_order_to_agent_distribution_order('10101010-0000-4000-8000-000000000104');
  exception
    when others then blocked := true;
  end;
  if not blocked then
    raise exception 'Expected closed customer order to be blocked.';
  end if;

  blocked := false;
  begin
    perform public.convert_customer_order_to_agent_distribution_order('10101010-0000-4000-8000-000000000105');
  exception
    when others then blocked := true;
  end;
  if not blocked then
    raise exception 'Expected non-promoted customer order to be blocked.';
  end if;
end $$;

reset role;

do $$
declare
  balance_total numeric;
  order_payment_status text;
  order_status text;
  invoice_status text;
begin
  select public.compute_payment_balance('10101010-0000-4000-8000-000000000106')
  into balance_total;

  if balance_total <> 0 then
    raise exception 'Expected promoted customer order balance to be zero after net receivable payment, got %',
      balance_total;
  end if;

  select customer_order.payment_status, customer_order.order_status
  into order_payment_status, order_status
  from public.customer_order
  where id = '10101010-0000-4000-8000-000000000106';

  if order_payment_status <> 'paid' or order_status <> 'closed' then
    raise exception 'Expected promoted customer order to be paid/closed after net receivable payment, got %/%',
      order_payment_status,
      order_status;
  end if;

  select invoice.status
  into invoice_status
  from public.invoice
  where order_id = '10101010-0000-4000-8000-000000000106';

  if invoice_status <> 'paid' then
    raise exception 'Expected promoted customer order invoice to be paid after net receivable payment, got %',
      invoice_status;
  end if;
end $$;

do $$
declare
  direct_balance numeric;
  direct_expected_commission numeric;
  direct_earned_commission numeric;
  order_row_commission numeric;
  order_row_remaining numeric;
begin
  select public.compute_payment_balance('10101010-0000-4000-8000-000000000105')
  into direct_balance;

  if direct_balance <> 100.00 then
    raise exception 'Expected assigned-agent direct order balance to remain gross 100.00, got %',
      direct_balance;
  end if;

  select public.compute_expected_commission('10101010-0000-4000-8000-000000000105')
  into direct_expected_commission;

  if direct_expected_commission <> 0.00 then
    raise exception 'Expected assigned-agent direct order expected commission to be zero, got %',
      direct_expected_commission;
  end if;

  select public.compute_earned_commission('10101010-0000-4000-8000-000000000105')
  into direct_earned_commission;

  if direct_earned_commission <> 0.00 then
    raise exception 'Expected assigned-agent direct order earned commission to be zero, got %',
      direct_earned_commission;
  end if;

  select
    (order_row.value->>'commission_total')::numeric,
    (order_row.value->>'remaining_receivable')::numeric
  into
    order_row_commission,
    order_row_remaining
  from public.list_admin_order_rows(null, null, null, null, 1, 100) rows
  cross join lateral jsonb_array_elements(rows.records) order_row(value)
  where order_row.value->>'id' = '10101010-0000-4000-8000-000000000105';

  if order_row_commission <> 0.00 or order_row_remaining <> 100.00 then
    raise exception 'Expected assigned-agent direct row commission/remaining 0/100, got %/%',
      order_row_commission,
      order_row_remaining;
  end if;
end $$;

do $$
declare
  converted_agent_order_id uuid;
  order_row_total numeric;
  order_row_commission numeric;
  order_row_paid numeric;
  order_row_remaining numeric;
begin
  select converted_to_agent_order_id
  into converted_agent_order_id
  from public.customer_order
  where id = '10101010-0000-4000-8000-000000000101';

  select
    (order_row.value->>'total_amount')::numeric,
    (order_row.value->>'commission_total')::numeric,
    (order_row.value->>'paid_total')::numeric,
    (order_row.value->>'remaining_receivable')::numeric
  into
    order_row_total,
    order_row_commission,
    order_row_paid,
    order_row_remaining
  from public.list_admin_order_rows(null, null, null, null, 1, 100) rows
  cross join lateral jsonb_array_elements(rows.records) order_row(value)
  where order_row.value->>'id' = converted_agent_order_id::text;

  if order_row_total <> 300.00
     or order_row_commission <> 45.00
     or order_row_paid <> 0.00
     or order_row_remaining <> 255.00 then
    raise exception 'Expected order row total/commission/paid/remaining 300/45/0/255, got %/%/%/%',
      order_row_total,
      order_row_commission,
      order_row_paid,
      order_row_remaining;
  end if;
end $$;

rollback;
