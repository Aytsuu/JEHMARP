begin;

do $$
declare
  agent_user_id constant uuid := '88888888-0000-4000-8000-000000000001';
  agent_profile_id uuid;
  auth_instance_id uuid;
  seeded_at timestamptz := now();
begin
  select id
  into auth_instance_id
  from auth.instances
  limit 1;

  insert into auth.users (
    instance_id,
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
    auth_instance_id,
    agent_user_id,
    'authenticated',
    'authenticated',
    'phase8-agent@nmc.test',
    extensions.crypt('Phase8TestOnly!', extensions.gen_salt('bf')),
    seeded_at,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Phase 8 Test Agent"}'::jsonb,
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

  insert into public.profile (id, user_id, first_name, last_name, display_name, phone_number, created_at, updated_at)
  values (agent_user_id, agent_user_id, 'Phase', 'Eight', 'Phase 8 Test Agent', '09170000008', seeded_at, seeded_at)
  on conflict (id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    phone_number = excluded.phone_number,
    updated_at = excluded.updated_at;

  insert into public.agent (
    user_id,
    profile_id,
    status,
    created_at,
    updated_at
  )
  values (
    agent_user_id,
    agent_user_id,
    'active',
    seeded_at,
    seeded_at
  )
  on conflict (user_id) do update
  set
    profile_id = excluded.profile_id,
    status = excluded.status,
    updated_at = excluded.updated_at
  returning id into agent_profile_id;

  if agent_profile_id is null then
    select id
    into agent_profile_id
    from public.agent
    where user_id = agent_user_id;
  end if;

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
    '88888888-0000-4000-8000-000000000010',
    'Phase 8 Product',
    'pork',
    'kg',
    100,
    80,
    'in_stock',
    true
  )
  on conflict (id) do nothing;

  insert into public.profile (id, first_name, last_name, phone_number, address, created_at, updated_at)
  values
    ('88888888-0000-4000-8000-000000000091', 'Customer', 'One', '09170000811', 'Phase 8 Address 1', seeded_at, seeded_at),
    ('88888888-0000-4000-8000-000000000092', 'Customer', 'Two', '09170000812', 'Phase 8 Address 2', seeded_at, seeded_at),
    ('88888888-0000-4000-8000-000000000093', 'Customer', 'Three', '09170000813', 'Phase 8 Address 3', seeded_at, seeded_at)
  on conflict (id) do nothing;

  insert into public.customer (
    id,
    profile_id,
    assigned_agent_id
  )
  values
    ('88888888-0000-4000-8000-000000000011', '88888888-0000-4000-8000-000000000091', agent_profile_id),
    ('88888888-0000-4000-8000-000000000012', '88888888-0000-4000-8000-000000000092', agent_profile_id),
    ('88888888-0000-4000-8000-000000000013', '88888888-0000-4000-8000-000000000093', agent_profile_id)
  on conflict (id) do nothing;

  insert into public."order" (
    id,
    order_kind,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by
  )
  values
    ('88888888-0000-4000-8000-000000000021', 'customer', '88888888-0000-4000-8000-000000000011', agent_profile_id, 'agent_submitted', 'processing', 'unpaid', agent_user_id),
    ('88888888-0000-4000-8000-000000000022', 'customer', '88888888-0000-4000-8000-000000000012', agent_profile_id, 'agent_submitted', 'processing', 'unpaid', agent_user_id),
    ('88888888-0000-4000-8000-000000000023', 'customer', '88888888-0000-4000-8000-000000000013', agent_profile_id, 'agent_submitted', 'processing', 'unpaid', agent_user_id);

  insert into public.order_item (
    order_kind,
    order_id,
    product_id,
    partial_quantity,
    final_quantity
  )
  values
    ('customer', '88888888-0000-4000-8000-000000000021', '88888888-0000-4000-8000-000000000010', 20, 20),
    ('customer', '88888888-0000-4000-8000-000000000022', '88888888-0000-4000-8000-000000000010', 10, 10),
    ('customer', '88888888-0000-4000-8000-000000000023', '88888888-0000-4000-8000-000000000010', 10, 10);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-0000-4000-8000-000000000001', true);

select public.submit_agent_received_payment_distribution(
  array[
    '88888888-0000-4000-8000-000000000021'::uuid,
    '88888888-0000-4000-8000-000000000022'::uuid,
    '88888888-0000-4000-8000-000000000023'::uuid
  ],
  3500,
  'Cash',
  'Cash on Delivery (COD)',
  '2026-07-18'::date,
  'PHASE8-3500',
  'Phase 8 distribution test'
);

reset role;

do $$
declare
  first_amount numeric;
  second_amount numeric;
  third_amount numeric;
  confirmed_payment_count integer;
begin
  select amount
  into first_amount
  from public.agent_received_payment
  where order_id = '88888888-0000-4000-8000-000000000021';

  select amount
  into second_amount
  from public.agent_received_payment
  where order_id = '88888888-0000-4000-8000-000000000022';

  select amount
  into third_amount
  from public.agent_received_payment
  where order_id = '88888888-0000-4000-8000-000000000023';

  if first_amount <> 2000 or second_amount <> 1000 or third_amount <> 500 then
    raise exception 'Expected distributed pending payments 2000, 1000, 500; got %, %, %',
      first_amount,
      second_amount,
      third_amount;
  end if;

  select count(*)
  into confirmed_payment_count
  from public.payment
  where order_id = any(array[
    '88888888-0000-4000-8000-000000000021'::uuid,
    '88888888-0000-4000-8000-000000000022'::uuid,
    '88888888-0000-4000-8000-000000000023'::uuid
  ]);

  if confirmed_payment_count <> 0 then
    raise exception 'Agent received payment distribution must not create confirmed payment records.';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-0000-4000-8000-000000000001', true);

do $$
declare
  overpayment_blocked boolean := false;
begin

  begin
    perform public.submit_agent_received_payment_distribution(
      array[
        '88888888-0000-4000-8000-000000000021'::uuid,
        '88888888-0000-4000-8000-000000000022'::uuid,
        '88888888-0000-4000-8000-000000000023'::uuid
      ],
      10000,
      'Cash',
      'Cash on Delivery (COD)',
      '2026-07-18'::date
    );
  exception
    when others then
      overpayment_blocked := true;
  end;

  if not overpayment_blocked then
    raise exception 'Expected overpayment beyond selected balances to be rejected.';
  end if;
end $$;

reset role;

rollback;
