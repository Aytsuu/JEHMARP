begin;

create temp table phase_7_result (
  key text primary key,
  value uuid
) on commit drop;

grant insert, select on phase_7_result to authenticated;

do $$
declare
  agent_user_id constant uuid := '22222222-2222-2222-2222-222222222222';
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
    'phase7-agent@nmc.test',
    extensions.crypt('Phase7TestOnly!', extensions.gen_salt('bf')),
    seeded_at,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Phase 7 Test Agent"}'::jsonb,
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

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    'phase7-agent@nmc.test',
    agent_user_id,
    jsonb_build_object(
      'sub', agent_user_id::text,
      'email', 'phase7-agent@nmc.test',
      'email_verified', true
    ),
    'email',
    seeded_at,
    seeded_at,
    seeded_at
  )
  on conflict (provider_id, provider) do update
  set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = excluded.updated_at;

  insert into public.profile (id, user_id, first_name, last_name, display_name, phone_number, created_at, updated_at)
  values (agent_user_id, agent_user_id, 'Phase', 'Agent', 'Phase 7 Test Agent', '09170000007', seeded_at, seeded_at)
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

  if agent_profile_id is null then
    raise exception 'Expected Phase 7 test agent profile';
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
    '70000000-0000-4000-8000-000000000071',
    'Phase 7 Agent Product',
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
    ('70000000-0000-4000-8000-000000000081', 'Assigned', 'Customer', '09170000001', 'Assigned test address', seeded_at, seeded_at),
    ('70000000-0000-4000-8000-000000000082', 'Unassigned', 'Customer', '09170000002', 'Unassigned test address', seeded_at, seeded_at)
  on conflict (id) do nothing;

  insert into public.customer (
    id,
    profile_id,
    assigned_agent_id
  )
  values (
    '70000000-0000-4000-8000-000000000072',
    '70000000-0000-4000-8000-000000000081',
    agent_profile_id
  )
  on conflict (id) do nothing;

  insert into public.customer (
    id,
    profile_id
  )
  values (
    '70000000-0000-4000-8000-000000000073',
    '70000000-0000-4000-8000-000000000082'
  )
  on conflict (id) do nothing;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

insert into phase_7_result (key, value)
select
  'distribution_agent_order',
  public.submit_agent_order(
    null,
    jsonb_build_array(
      jsonb_build_object(
        'productId', '70000000-0000-4000-8000-000000000071',
        'quantity', 10,
        'addDetails', 'Phase 7 distribution order item'
      )
    ),
    jsonb_build_object('releaseDate', '2026-07-21')
  );

insert into phase_7_result (key, value)
select
  'personal_customer_order',
  public.submit_agent_order(
    null,
    jsonb_build_array(
      jsonb_build_object(
        'productId', '70000000-0000-4000-8000-000000000071',
        'quantity', 3,
        'addDetails', 'Phase 7 personal order item'
      )
    ),
    jsonb_build_object(
      'orderFor', 'personal',
      'releaseDate', '2026-07-22'
    )
  );

insert into phase_7_result (key, value)
select
  'submitted_order',
  public.submit_agent_order(
    '70000000-0000-4000-8000-000000000072',
    jsonb_build_array(
      jsonb_build_object(
        'productId', '70000000-0000-4000-8000-000000000071',
        'quantity', 2,
        'addDetails', 'Phase 7 order item'
      )
    )
  );

insert into phase_7_result (key, value)
select
  'new_customer_order',
  public.submit_agent_order(
    null,
    jsonb_build_array(
      jsonb_build_object(
        'productId', '70000000-0000-4000-8000-000000000071',
        'quantity', 1,
        'addDetails', 'Phase 7 new customer order item'
      )
    ),
    jsonb_build_object(
      'firstName', 'New',
      'lastName', 'Agent Customer',
      'phoneNumber', '09170000003',
      'email', '',
      'address', 'New customer test address'
    )
  );

do $$
declare
  direct_insert_blocked boolean := false;
  unassigned_blocked boolean := false;
begin
  begin
    insert into public."order" (
      order_kind,
      customer_id,
      source,
      order_status,
      payment_status
    )
    values (
      'customer',
      '70000000-0000-4000-8000-000000000072',
      'agent_submitted',
      'pending',
      'unpaid'
    );
  exception
    when others then
      direct_insert_blocked := true;
  end;

  if not direct_insert_blocked then
    raise exception 'Expected direct agent order inserts to remain blocked';
  end if;

  begin
    perform public.submit_agent_order(
      '70000000-0000-4000-8000-000000000073',
      jsonb_build_array(
        jsonb_build_object(
          'productId', '70000000-0000-4000-8000-000000000071',
          'quantity', 1
        )
      )
    );
  exception
    when others then
      unassigned_blocked := true;
  end;

  if not unassigned_blocked then
    raise exception 'Expected agent order RPC to reject unassigned customers';
  end if;
end $$;

reset role;

do $$
declare
  agent_profile_id uuid;
  submitted_order_id uuid;
  new_customer_order_id uuid;
  distribution_agent_order_id uuid;
  personal_customer_order_id uuid;
  new_customer_id uuid;
  item_count integer;
  numeric_result numeric;
  text_result text;
  can_anon_execute boolean;
begin
  select id
  into agent_profile_id
  from public.agent
  where user_id = '22222222-2222-2222-2222-222222222222';

  select value
  into distribution_agent_order_id
  from phase_7_result
  where key = 'distribution_agent_order';

  select value
  into personal_customer_order_id
  from phase_7_result
  where key = 'personal_customer_order';

  select value
  into submitted_order_id
  from phase_7_result
  where key = 'submitted_order';

  select value
  into new_customer_order_id
  from phase_7_result
  where key = 'new_customer_order';

  if submitted_order_id is null then
    raise exception 'Expected submit_agent_order to return an order id';
  end if;

  if distribution_agent_order_id is null then
    raise exception 'Expected product-only submit_agent_order to return an agent order id';
  end if;

  if personal_customer_order_id is null then
    raise exception 'Expected personal submit_agent_order to return a customer order id';
  end if;

  if new_customer_order_id is null then
    raise exception 'Expected submit_agent_order to return an order id for new customer orders';
  end if;

  if not exists (
    select 1
    from public."order"
    where id = distribution_agent_order_id
      and order_kind = 'distribution'
      and agent_id = agent_profile_id
      and order_status = 'pending_order'
      and release_date = timezone('Asia/Manila', timestamp '2026-07-21 00:00:00')
      and submitted_by = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'Expected product-only agent order to require admin approval';
  end if;

  select count(*)
  into item_count
  from public.order_item
  where order_id = distribution_agent_order_id
    and order_kind = 'distribution'
    and product_id = '70000000-0000-4000-8000-000000000071'
    and partial_quantity = 10
    and add_details = 'Phase 7 distribution order item';

  if item_count <> 1 then
    raise exception 'Expected one product-only agent order item, got %', item_count;
  end if;

  if exists (
    select 1
    from public."order"
    where id = distribution_agent_order_id
      and order_kind in ('customer', 'personal')
  ) then
    raise exception 'Expected product-only agent order not to create a customer order with the same id';
  end if;

  if not exists (
    select 1
    from public."order"
    where id = personal_customer_order_id
      and order_kind = 'personal'
      and agent_id = agent_profile_id
      and source = 'agent_submitted'
      and order_status = 'pending'
      and payment_status = 'unpaid'
      and release_date = timezone('Asia/Manila', timestamp '2026-07-22 00:00:00')
      and submitted_by = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'Expected personal agent order to create a normal linked customer order';
  end if;

  select count(*)
  into item_count
  from public.order_item
  where order_id = personal_customer_order_id
    and order_kind = 'personal'
    and product_id = '70000000-0000-4000-8000-000000000071'
    and partial_quantity = 3
    and final_quantity = 3
    and add_details = 'Phase 7 personal order item';

  if item_count <> 1 then
    raise exception 'Expected one personal customer order item, got %', item_count;
  end if;

  if not exists (
    select 1
    from public."order"
    where id = submitted_order_id
      and order_kind = 'customer'
      and customer_id = '70000000-0000-4000-8000-000000000072'
      and agent_id = agent_profile_id
      and source = 'agent_submitted'
      and order_status = 'pending'
      and payment_status = 'unpaid'
      and submitted_by = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'Expected submitted agent order to include agent ownership and workflow defaults';
  end if;

  select count(*)
  into item_count
  from public.order_item
  where order_id = submitted_order_id
    and order_kind = 'customer'
    and product_id = '70000000-0000-4000-8000-000000000071'
    and partial_quantity = 2
    and final_quantity = 2
    and add_details = 'Phase 7 order item';

  if item_count <> 1 then
    raise exception 'Expected one agent order item with synced quantities, got %', item_count;
  end if;

  select unit_price, price_type
  into numeric_result, text_result
  from public.order_item
  where order_id = submitted_order_id
    and order_kind = 'customer';

  if numeric_result <> 100 or text_result <> 'retail' then
    raise exception 'Expected agent order item to use retail price 100, got % type %', numeric_result, text_result;
  end if;

  select customer_id
  into new_customer_id
  from public."order"
    where id = new_customer_order_id
      and order_kind = 'customer'
      and agent_id = agent_profile_id
      and source = 'agent_submitted'
      and order_status = 'pending'
      and payment_status = 'unpaid'
      and submitted_by = '22222222-2222-2222-2222-222222222222';

  if new_customer_id is null then
    raise exception 'Expected submitted new customer order to include agent ownership and workflow defaults';
  end if;

  if not exists (
    select 1
    from public.customer
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where customer.id = new_customer_id
      and customer_person.first_name = 'New'
      and customer_person.last_name = 'Agent Customer'
      and customer_person.phone_number = '09170000003'
      and customer_person.address = 'New customer test address'
      and customer.assigned_agent_id = agent_profile_id
      and customer.created_by = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'Expected new agent customer to be assigned to the submitting agent';
  end if;

  select has_function_privilege('anon', 'public.submit_agent_order(uuid, jsonb, jsonb)', 'execute')
  into can_anon_execute;

  if can_anon_execute then
    raise exception 'anon must not execute the trusted agent order function directly';
  end if;
end $$;

rollback;
