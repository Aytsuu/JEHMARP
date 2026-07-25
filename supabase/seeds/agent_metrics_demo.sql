-- Local demo seed for agent performance quick stats (metrics cards).
-- Target agent: Narcisan Galamiton (76580072-beac-4e6d-ad39-df81765d8286)

do $$
declare
  agent_id constant uuid := '76580072-beac-4e6d-ad39-df81765d8286';
  agent_user_id constant uuid := 'bc35b646-9ae5-4225-b416-1a396f7262d5';
  admin_user_id constant uuid := '4f9eb4de-70c2-48ca-830c-b5124cc805a6';
  customer_paolo constant uuid := '7e32596e-14f7-4790-a005-a23e16f94899';
  product_chicken constant uuid := '5233d7ec-9d21-4598-bd45-1812e530907c';
  product_pork constant uuid := 'aaaaaaaa-0001-4000-8000-000000000001';
  product_wings constant uuid := 'aaaaaaaa-0001-4000-8000-000000000002';
  customer_maria constant uuid := 'bbbbbbbb-0001-4000-8000-000000000001';
  customer_ben constant uuid := 'bbbbbbbb-0001-4000-8000-000000000002';
  profile_maria constant uuid := 'bbbbbbbb-0002-4000-8000-000000000001';
  profile_ben constant uuid := 'bbbbbbbb-0002-4000-8000-000000000002';
  dist_order_id constant uuid := 'cccccccc-0001-4000-8000-000000000001';
  seeded_at timestamptz := '2026-07-01T08:00:00+08';
begin
  insert into public.product (
    id,
    name,
    category,
    description,
    unit_label,
    default_price,
    reseller_price,
    stock_status,
    is_active,
    agent_commission_type,
    agent_commission_value
  )
  values
    (
      product_pork,
      'Pork Belly',
      'pork',
      'Demo pork product for agent metrics',
      'kg',
      280,
      250,
      'in_stock',
      true,
      'value',
      25
    ),
    (
      product_wings,
      'Chicken Wings',
      'chicken',
      'Demo chicken product for agent metrics',
      'kg',
      260,
      230,
      'in_stock',
      true,
      'value',
      18
    )
  on conflict (id) do update
  set
    name = excluded.name,
    category = excluded.category,
    default_price = excluded.default_price,
    agent_commission_value = excluded.agent_commission_value,
    updated_at = now();

  insert into public.profile (
    id,
    first_name,
    last_name,
    display_name,
    phone_number,
    address,
    created_at,
    updated_at
  )
  values
    (profile_maria, 'Maria', 'Santos', 'Maria Santos', '09171234001', 'Quezon City', seeded_at, seeded_at),
    (profile_ben, 'Ben', 'Cruz', 'Ben Cruz', '09171234002', 'Makati City', seeded_at, seeded_at)
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    phone_number = excluded.phone_number,
    address = excluded.address,
    updated_at = now();

  insert into public.customer (
    id,
    profile_id,
    assigned_agent_id,
    tracking_number,
    created_at,
    updated_at
  )
  values
    (customer_maria, profile_maria, agent_id, 'JHM-METR0001', seeded_at, seeded_at),
    (customer_ben, profile_ben, agent_id, 'JHM-METR0002', seeded_at, seeded_at)
  on conflict (id) do update
  set
    assigned_agent_id = excluded.assigned_agent_id,
    updated_at = now();

  -- Closed + paid orders (commission earned)
  insert into public."order" (
    id,
    order_kind,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by,
    sale_date,
    release_date,
    created_at,
    updated_at
  )
  values
    ('d1000001-0001-4000-8000-000000000001', 'customer', customer_paolo, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-02T10:00:00+08', '2026-07-02T10:00:00+08', '2026-07-02T08:00:00+08', '2026-07-05T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000002', 'customer', customer_maria, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-04T10:00:00+08', '2026-07-04T10:00:00+08', '2026-07-04T08:00:00+08', '2026-07-08T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000003', 'customer', customer_ben, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-06T10:00:00+08', '2026-07-06T10:00:00+08', '2026-07-06T08:00:00+08', '2026-07-10T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000004', 'customer', customer_paolo, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-08T10:00:00+08', '2026-07-08T10:00:00+08', '2026-07-08T08:00:00+08', '2026-07-12T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000005', 'customer', customer_maria, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-10T10:00:00+08', '2026-07-10T10:00:00+08', '2026-07-10T08:00:00+08', '2026-07-14T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000006', 'customer', customer_ben, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-12T10:00:00+08', '2026-07-12T10:00:00+08', '2026-07-12T08:00:00+08', '2026-07-16T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000007', 'customer', customer_paolo, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-14T10:00:00+08', '2026-07-14T10:00:00+08', '2026-07-14T08:00:00+08', '2026-07-18T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000008', 'customer', customer_maria, agent_id, 'agent_submitted', 'closed', 'paid', agent_user_id, '2026-07-16T10:00:00+08', '2026-07-16T10:00:00+08', '2026-07-16T08:00:00+08', '2026-07-20T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000009', 'customer', customer_ben, agent_id, 'agent_submitted', 'closed', 'partial', agent_user_id, '2026-07-18T10:00:00+08', '2026-07-18T10:00:00+08', '2026-07-18T08:00:00+08', '2026-07-20T08:00:00+08'),
    ('d1000001-0001-4000-8000-000000000010', 'customer', customer_paolo, agent_id, 'agent_submitted', 'processing', 'unpaid', agent_user_id, null, '2026-07-20T10:00:00+08', '2026-07-20T08:00:00+08', '2026-07-20T08:00:00+08')
  on conflict (id) do nothing;

  insert into public.order_item (
    order_kind,
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    unit_price,
    price_type,
    agent_commission_amount,
    agent_commission_paid,
    agent_order_quantity_increase
  )
  values
    ('customer', 'd1000001-0001-4000-8000-000000000001', product_pork, 15, 15, 280, 'retail', 375, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000002', product_chicken, 12, 12, 300, 'retail', 240, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000003', product_pork, 8, 8, 280, 'retail', 200, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000004', product_chicken, 20, 20, 300, 'retail', 400, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000005', product_wings, 18, 18, 260, 'retail', 324, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000006', product_pork, 10, 10, 280, 'retail', 250, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000007', product_chicken, 14, 14, 300, 'retail', 280, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000008', product_wings, 16, 16, 260, 'retail', 288, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000009', product_pork, 6, 6, 280, 'retail', 150, false, 0),
    ('customer', 'd1000001-0001-4000-8000-000000000010', product_chicken, 9, 9, 300, 'retail', 180, false, 0)
  on conflict do nothing;

  -- Full payments for closed+paid orders (receivable = gross - commission)
  insert into public.payment (
    id,
    order_id,
    amount,
    payment_method,
    payment_terms,
    payment_date,
    recorded_by,
    reference_number,
    created_at
  )
  values
    ('e1000001-0001-4000-8000-000000000001', 'd1000001-0001-4000-8000-000000000001', 3825, 'Cash', 'Cash on Delivery (COD)', '2026-07-05T08:00:00+08', admin_user_id, 'PAY-MET-001', '2026-07-05T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000002', 'd1000001-0001-4000-8000-000000000002', 3360, 'Cash', 'Cash on Delivery (COD)', '2026-07-08T08:00:00+08', admin_user_id, 'PAY-MET-002', '2026-07-08T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000003', 'd1000001-0001-4000-8000-000000000003', 2040, 'Cash', 'Cash on Delivery (COD)', '2026-07-10T08:00:00+08', admin_user_id, 'PAY-MET-003', '2026-07-10T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000004', 'd1000001-0001-4000-8000-000000000004', 5600, 'Cash', 'Bank Transfer', '2026-07-12T08:00:00+08', admin_user_id, 'PAY-MET-004', '2026-07-12T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000005', 'd1000001-0001-4000-8000-000000000005', 4356, 'Cash', 'Gcash', '2026-07-14T08:00:00+08', admin_user_id, 'PAY-MET-005', '2026-07-14T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000006', 'd1000001-0001-4000-8000-000000000006', 2550, 'Cash', 'Cash on Delivery (COD)', '2026-07-16T08:00:00+08', admin_user_id, 'PAY-MET-006', '2026-07-16T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000007', 'd1000001-0001-4000-8000-000000000007', 3920, 'Cash', 'Cash on Delivery (COD)', '2026-07-18T08:00:00+08', admin_user_id, 'PAY-MET-007', '2026-07-18T08:00:00+08'),
    ('e1000001-0001-4000-8000-000000000008', 'd1000001-0001-4000-8000-000000000008', 3872, 'Cash', 'Bank Transfer', '2026-07-20T08:00:00+08', admin_user_id, 'PAY-MET-008', '2026-07-20T08:00:00+08')
  on conflict (id) do nothing;

  -- Agent remittance submissions (mix of confirmed, pending, rejected)
  insert into public.agent_received_payment (
    id,
    order_id,
    agent_id,
    amount,
    payment_method,
    payment_terms,
    payment_date,
    reference_number,
    notes,
    status,
    confirmed_payment_id,
    confirmed_by,
    confirmed_at,
    created_at,
    updated_at
  )
  values
    (
      'f1000001-0001-4000-8000-000000000001',
      'd1000001-0001-4000-8000-000000000001',
      agent_id,
      3825,
      'Cash',
      'Cash on Delivery (COD)',
      '2026-07-04T08:00:00+08',
      'REM-MET-001',
      'Fast remittance',
      'confirmed',
      'e1000001-0001-4000-8000-000000000001',
      admin_user_id,
      '2026-07-05T08:00:00+08',
      '2026-07-04T08:00:00+08',
      '2026-07-05T08:00:00+08'
    ),
    (
      'f1000001-0001-4000-8000-000000000002',
      'd1000001-0001-4000-8000-000000000002',
      agent_id,
      3360,
      'Cash',
      'Cash on Delivery (COD)',
      '2026-07-09T08:00:00+08',
      'REM-MET-002',
      'On-time remittance',
      'confirmed',
      'e1000001-0001-4000-8000-000000000002',
      admin_user_id,
      '2026-07-08T08:00:00+08',
      '2026-07-09T08:00:00+08',
      '2026-07-09T08:00:00+08'
    ),
    (
      'f1000001-0001-4000-8000-000000000003',
      'd1000001-0001-4000-8000-000000000003',
      agent_id,
      2040,
      'Cash',
      'Cash on Delivery (COD)',
      '2026-07-12T08:00:00+08',
      'REM-MET-003',
      null,
      'confirmed',
      'e1000001-0001-4000-8000-000000000003',
      admin_user_id,
      '2026-07-10T08:00:00+08',
      '2026-07-12T08:00:00+08',
      '2026-07-12T08:00:00+08'
    ),
    (
      'f1000001-0001-4000-8000-000000000004',
      'd1000001-0001-4000-8000-000000000004',
      agent_id,
      5600,
      'Cash',
      'Bank Transfer',
      '2026-07-20T08:00:00+08',
      'REM-MET-004',
      'Slower remittance',
      'confirmed',
      'e1000001-0001-4000-8000-000000000004',
      admin_user_id,
      '2026-07-12T08:00:00+08',
      '2026-07-20T08:00:00+08',
      '2026-07-20T08:00:00+08'
    ),
    (
      'f1000001-0001-4000-8000-000000000005',
      'd1000001-0001-4000-8000-000000000005',
      agent_id,
      4356,
      'Cash',
      'Gcash',
      '2026-07-22T08:00:00+08',
      'REM-MET-005',
      null,
      'pending_admin_confirmation',
      null,
      null,
      null,
      '2026-07-22T08:00:00+08',
      '2026-07-22T08:00:00+08'
    ),
    (
      'f1000001-0001-4000-8000-000000000006',
      'd1000001-0001-4000-8000-000000000006',
      agent_id,
      2550,
      'Cash',
      'Cash on Delivery (COD)',
      '2026-07-23T08:00:00+08',
      'REM-MET-006',
      null,
      'pending_admin_confirmation',
      null,
      null,
      null,
      '2026-07-23T08:00:00+08',
      '2026-07-23T08:00:00+08'
    ),
    (
      'f1000001-0001-4000-8000-000000000007',
      'd1000001-0001-4000-8000-000000000007',
      agent_id,
      3920,
      'Cash',
      'Cash on Delivery (COD)',
      '2026-07-19T08:00:00+08',
      'REM-MET-007',
      'Rejected sample',
      'rejected',
      null,
      null,
      null,
      '2026-07-19T08:00:00+08',
      '2026-07-19T08:00:00+08'
    )
  on conflict (id) do nothing;

  -- Closed distribution order for additional kg sold + commission
  insert into public."order" (
    id,
    order_kind,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by,
    sale_date,
    release_date,
    created_at,
    updated_at
  )
  values (
    dist_order_id,
    'distribution',
    null,
    agent_id,
    'agent_submitted',
    'closed',
    'paid',
    agent_user_id,
    '2026-07-15T10:00:00+08',
    '2026-07-15T10:00:00+08',
    '2026-07-15T08:00:00+08',
    '2026-07-17T08:00:00+08'
  )
  on conflict (id) do nothing;

  insert into public.order_item (
    order_kind,
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    agent_commission_amount,
    agent_commission_paid,
    agent_order_quantity_increase
  )
  values
    ('distribution', dist_order_id, product_chicken, 25, 25, 500, false, 0),
    ('distribution', dist_order_id, product_pork, 12, 12, 300, false, 0)
  on conflict do nothing;

end $$;
