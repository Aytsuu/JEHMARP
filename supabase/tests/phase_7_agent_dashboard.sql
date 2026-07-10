begin;

create temp table phase_7_result (
  key text primary key,
  value uuid
) on commit drop;

grant insert, select on phase_7_result to authenticated;

do $$
declare
  agent_profile_id uuid;
begin
  select id
  into agent_profile_id
  from public.agent_profile
  where user_id = '22222222-2222-2222-2222-222222222222';

  if agent_profile_id is null then
    raise exception 'Expected seeded agent profile for Phase 7 tests';
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

  insert into public.customer (
    id,
    first_name,
    last_name,
    phone_number,
    address,
    assigned_agent_id
  )
  values (
    '70000000-0000-4000-8000-000000000072',
    'Assigned',
    'Customer',
    '09170000001',
    'Assigned test address',
    agent_profile_id
  )
  on conflict (id) do nothing;

  insert into public.customer (
    id,
    first_name,
    last_name,
    phone_number,
    address
  )
  values (
    '70000000-0000-4000-8000-000000000073',
    'Unassigned',
    'Customer',
    '09170000002',
    'Unassigned test address'
  )
  on conflict (id) do nothing;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

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
    insert into public.customer_order (
      customer_id,
      source,
      order_status,
      payment_status
    )
    values (
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
    raise exception 'Expected direct agent customer_order inserts to remain blocked';
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
  new_customer_id uuid;
  item_count integer;
  numeric_result numeric;
  text_result text;
  can_anon_execute boolean;
begin
  select id
  into agent_profile_id
  from public.agent_profile
  where user_id = '22222222-2222-2222-2222-222222222222';

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

  if new_customer_order_id is null then
    raise exception 'Expected submit_agent_order to return an order id for new customer orders';
  end if;

  if not exists (
    select 1
    from public.customer_order
    where id = submitted_order_id
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
  from public.customer_order_item
  where order_id = submitted_order_id
    and product_id = '70000000-0000-4000-8000-000000000071'
    and partial_quantity = 2
    and final_quantity = 2
    and add_details = 'Phase 7 order item';

  if item_count <> 1 then
    raise exception 'Expected one agent order item with synced quantities, got %', item_count;
  end if;

  select unit_price, price_type
  into numeric_result, text_result
  from public.customer_order_item
  where order_id = submitted_order_id;

  if numeric_result <> 100 or text_result <> 'retail' then
    raise exception 'Expected agent order item to use retail price 100, got % type %', numeric_result, text_result;
  end if;

  select customer_id
  into new_customer_id
  from public.customer_order
    where id = new_customer_order_id
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
    where id = new_customer_id
      and first_name = 'New'
      and last_name = 'Agent Customer'
      and phone_number = '09170000003'
      and address = 'New customer test address'
      and assigned_agent_id = agent_profile_id
      and created_by = '22222222-2222-2222-2222-222222222222'
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
