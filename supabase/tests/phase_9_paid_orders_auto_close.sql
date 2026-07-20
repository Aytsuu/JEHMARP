begin;

do $$
declare
  seeded_at timestamptz := '2026-07-18T00:00:00Z'::timestamptz;
  agent_user_id uuid := '99999999-0000-4000-8000-000000000001';
  agent_profile_id uuid;
  product_id uuid := '99999999-0000-4000-8000-000000000010';
  first_customer_id uuid := '99999999-0000-4000-8000-000000000011';
  second_customer_id uuid := '99999999-0000-4000-8000-000000000012';
  agent_order_id uuid := '99999999-0000-4000-8000-000000000020';
  first_order_id uuid := '99999999-0000-4000-8000-000000000021';
  second_order_id uuid := '99999999-0000-4000-8000-000000000022';
  text_result text;
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
  values (
    agent_user_id,
    'authenticated',
    'authenticated',
    'phase9-agent@example.test',
    crypt('phase9-password', gen_salt('bf')),
    seeded_at,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    seeded_at,
    seeded_at
  )
  on conflict (id) do update
  set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at,
    deleted_at = null;

  insert into public.profile (id, display_name, created_at, updated_at)
  values (agent_user_id, 'Phase 9 Test Agent', seeded_at, seeded_at)
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    updated_at = excluded.updated_at;

  insert into public.agent_profile (
    user_id,
    first_name,
    last_name,
    display_name,
    status,
    contact,
    created_at,
    updated_at
  )
  values (
    agent_user_id,
    'Phase',
    'Nine',
    'Phase 9 Test Agent',
    'active',
    '09179999999',
    seeded_at,
    seeded_at
  )
  returning id into agent_profile_id;

  insert into public.product (
    id,
    name,
    category,
    unit_label,
    default_price,
    reseller_price,
    stock_status,
    is_active
  )
  values (
    product_id,
    'Phase 9 Product',
    'pork',
    'kg',
    100,
    80,
    'in_stock',
    true
  );

  insert into public.customer (
    id,
    first_name,
    last_name,
    phone_number,
    address,
    assigned_agent_id
  )
  values
    (first_customer_id, 'Paid', 'One', '09179999991', 'Phase 9 Address 1', agent_profile_id),
    (second_customer_id, 'Paid', 'Two', '09179999992', 'Phase 9 Address 2', agent_profile_id);

  insert into public.agent_order (
    id,
    agent_id,
    order_status,
    submitted_by
  )
  values (
    agent_order_id,
    agent_profile_id,
    'processing',
    agent_user_id
  );

  insert into public.customer_order (
    id,
    customer_id,
    agent_id,
    agent_order_id,
    source,
    order_status,
    payment_status,
    submitted_by
  )
  values
    (first_order_id, first_customer_id, agent_profile_id, agent_order_id, 'agent_submitted', 'processing', 'unpaid', agent_user_id),
    (second_order_id, second_customer_id, agent_profile_id, agent_order_id, 'agent_submitted', 'processing', 'unpaid', agent_user_id);

  insert into public.customer_order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity
  )
  values
    (first_order_id, product_id, 2, 2),
    (second_order_id, product_id, 1, 1);

  insert into public.invoice (order_id)
  values
    (first_order_id),
    (second_order_id);

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    payment_terms,
    reference_number
  )
  values (
    first_order_id,
    200,
    'Cash',
    'Cash on Delivery (COD)',
    'phase-9-first-full-payment'
  );

  select order_status
  into text_result
  from public.customer_order
  where id = first_order_id;

  if text_result <> 'closed' then
    raise exception 'Expected first fully paid customer order to close, got %', text_result;
  end if;

  select order_status
  into text_result
  from public.agent_order
  where id = agent_order_id;

  if text_result <> 'processing' then
    raise exception 'Expected agent order to remain processing while one linked order is unpaid, got %', text_result;
  end if;

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    payment_terms,
    reference_number
  )
  values (
    second_order_id,
    100,
    'Cash',
    'Cash on Delivery (COD)',
    'phase-9-second-full-payment'
  );

  select order_status
  into text_result
  from public.customer_order
  where id = second_order_id;

  if text_result <> 'closed' then
    raise exception 'Expected second fully paid customer order to close, got %', text_result;
  end if;

  select order_status
  into text_result
  from public.agent_order
  where id = agent_order_id;

  if text_result <> 'closed' then
    raise exception 'Expected agent order to close after all linked customer orders are paid, got %', text_result;
  end if;
end $$;

rollback;
