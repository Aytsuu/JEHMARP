alter table public.invoice disable trigger validate_invoice_status_transition;

do $$
declare
  admin_user_id constant uuid := '11111111-1111-1111-1111-111111111111';
  agent_user_id constant uuid := '22222222-2222-2222-2222-222222222222';
  agent_profile_id uuid;
begin
  select id
  into agent_profile_id
  from public.agent_profile
  where user_id = agent_user_id
  limit 1;

  if agent_profile_id is null then
    insert into public.agent_profile (user_id, display_name, status, created_at, updated_at)
    values (
      agent_user_id,
      'JEHMARP Mock Agent',
      'active',
      '2026-07-01T00:00:00Z',
      '2026-07-01T00:00:00Z'
    )
    on conflict (user_id) do update
    set
      display_name = excluded.display_name,
      status = excluded.status,
      updated_at = excluded.updated_at
    returning id into agent_profile_id;
  end if;

  delete from public.payment
  where id in (
    '60606060-0000-4000-8000-000000000001',
    '60606060-0000-4000-8000-000000000002',
    '60606060-0000-4000-8000-000000000003'
  );

  delete from public.invoice
  where id in (
    '50505050-0000-4000-8000-000000000001',
    '50505050-0000-4000-8000-000000000002',
    '50505050-0000-4000-8000-000000000003',
    '50505050-0000-4000-8000-000000000004',
    '50505050-0000-4000-8000-000000000005'
  )
  or order_id in (
    '30303030-0000-4000-8000-000000000001',
    '30303030-0000-4000-8000-000000000002',
    '30303030-0000-4000-8000-000000000003',
    '30303030-0000-4000-8000-000000000004',
    '30303030-0000-4000-8000-000000000005'
  );

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
    created_at,
    updated_at
  )
  values
    (
      '10101010-0000-4000-8000-000000000001',
      'Analytics Pork Belly',
      'pork',
      'Mock analytics product for Phase 10.',
      'kg',
      320,
      295,
      'in_stock',
      true,
      '2026-07-01T00:00:00Z',
      '2026-07-01T00:00:00Z'
    ),
    (
      '10101010-0000-4000-8000-000000000002',
      'Analytics Chicken Thigh',
      'chicken',
      'Mock analytics product for Phase 10.',
      'kg',
      180,
      165,
      'in_stock',
      true,
      '2026-07-01T00:00:00Z',
      '2026-07-01T00:00:00Z'
    ),
    (
      '10101010-0000-4000-8000-000000000003',
      'Analytics Egg Tray',
      'egg',
      'Mock analytics product for Phase 10.',
      'tray',
      230,
      210,
      'limited',
      true,
      '2026-07-01T00:00:00Z',
      '2026-07-01T00:00:00Z'
    )
  on conflict (id) do update
  set
    name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    unit_label = excluded.unit_label,
    default_price = excluded.default_price,
    reseller_price = excluded.reseller_price,
    stock_status = excluded.stock_status,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

  insert into public.customer (
    id,
    first_name,
    last_name,
    phone_number,
    email,
    address,
    assigned_agent_id,
    created_by,
    is_reseller,
    created_at,
    updated_at
  )
  values
    (
      '20202020-0000-4000-8000-000000000001',
      'Ana',
      'Analytics',
      '09170001001',
      'ana.analytics@example.test',
      'Mock analytics customer address 1',
      agent_profile_id,
      admin_user_id,
      false,
      '2026-07-01T08:00:00Z',
      '2026-07-01T08:00:00Z'
    ),
    (
      '20202020-0000-4000-8000-000000000002',
      'Ben',
      'Analytics',
      '09170001002',
      'ben.analytics@example.test',
      'Mock analytics customer address 2',
      agent_profile_id,
      admin_user_id,
      true,
      '2026-07-01T08:05:00Z',
      '2026-07-01T08:05:00Z'
    ),
    (
      '20202020-0000-4000-8000-000000000003',
      'Cora',
      'Analytics',
      '09170001003',
      'cora.analytics@example.test',
      'Mock analytics customer address 3',
      null,
      admin_user_id,
      false,
      '2026-07-01T08:10:00Z',
      '2026-07-01T08:10:00Z'
    ),
    (
      '20202020-0000-4000-8000-000000000004',
      'Dino',
      'Analytics',
      '09170001004',
      'dino.analytics@example.test',
      'Mock analytics customer address 4',
      agent_profile_id,
      admin_user_id,
      false,
      '2026-07-01T08:15:00Z',
      '2026-07-01T08:15:00Z'
    )
  on conflict (id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    phone_number = excluded.phone_number,
    email = excluded.email,
    address = excluded.address,
    assigned_agent_id = excluded.assigned_agent_id,
    created_by = excluded.created_by,
    is_reseller = excluded.is_reseller,
    updated_at = excluded.updated_at;

  insert into public.customer_order (
    id,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
  )
  values
    (
      '30303030-0000-4000-8000-000000000001',
      '20202020-0000-4000-8000-000000000001',
      agent_profile_id,
      'agent_submitted',
      'processing',
      'partial',
      agent_user_id,
      admin_user_id,
      '2026-07-01T09:30:00Z',
      '2026-07-01T09:00:00Z',
      '2026-07-01T09:30:00Z'
    ),
    (
      '30303030-0000-4000-8000-000000000002',
      '20202020-0000-4000-8000-000000000002',
      null,
      'admin_manual',
      'closed',
      'paid',
      admin_user_id,
      admin_user_id,
      '2026-07-02T10:30:00Z',
      '2026-07-02T10:00:00Z',
      '2026-07-02T12:00:00Z'
    ),
    (
      '30303030-0000-4000-8000-000000000003',
      '20202020-0000-4000-8000-000000000004',
      agent_profile_id,
      'agent_submitted',
      'closed',
      'paid',
      agent_user_id,
      admin_user_id,
      '2026-07-03T11:30:00Z',
      '2026-07-03T11:00:00Z',
      '2026-07-03T13:00:00Z'
    ),
    (
      '30303030-0000-4000-8000-000000000004',
      '20202020-0000-4000-8000-000000000001',
      agent_profile_id,
      'agent_submitted',
      'processing',
      'unpaid',
      agent_user_id,
      admin_user_id,
      '2026-06-28T10:30:00Z',
      '2026-06-28T10:00:00Z',
      '2026-06-28T10:30:00Z'
    ),
    (
      '30303030-0000-4000-8000-000000000005',
      '20202020-0000-4000-8000-000000000003',
      null,
      'guest_shop',
      'pending',
      'unpaid',
      null,
      null,
      null,
      '2026-07-04T08:00:00Z',
      '2026-07-04T08:00:00Z'
    )
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    agent_id = excluded.agent_id,
    source = excluded.source,
    order_status = excluded.order_status,
    payment_status = excluded.payment_status,
    submitted_by = excluded.submitted_by,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = excluded.updated_at;

  insert into public.customer_order_item (
    id,
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    unit_price,
    price_type,
    add_details,
    agent_commission_amount,
    agent_commission_status,
    agent_commission_set_by,
    agent_commission_set_at,
    agent_commission_notes,
    created_at,
    updated_at
  )
  values
    (
      '40404040-0000-4000-8000-000000000001',
      '30303030-0000-4000-8000-000000000001',
      '10101010-0000-4000-8000-000000000001',
      2,
      2,
      320,
      'retail',
      'Phase 10 mock analytics order line.',
      80,
      'set',
      admin_user_id,
      '2026-07-01T09:30:00Z',
      'Mock commission for analytics.',
      '2026-07-01T09:00:00Z',
      '2026-07-01T09:30:00Z'
    ),
    (
      '40404040-0000-4000-8000-000000000002',
      '30303030-0000-4000-8000-000000000001',
      '10101010-0000-4000-8000-000000000002',
      4,
      4,
      180,
      'retail',
      'Phase 10 mock analytics order line.',
      60,
      'set',
      admin_user_id,
      '2026-07-01T09:30:00Z',
      'Mock commission for analytics.',
      '2026-07-01T09:00:00Z',
      '2026-07-01T09:30:00Z'
    ),
    (
      '40404040-0000-4000-8000-000000000003',
      '30303030-0000-4000-8000-000000000002',
      '10101010-0000-4000-8000-000000000003',
      3,
      3,
      230,
      'retail',
      'Phase 10 mock analytics order line.',
      0,
      'unset',
      null,
      null,
      null,
      '2026-07-02T10:00:00Z',
      '2026-07-02T10:00:00Z'
    ),
    (
      '40404040-0000-4000-8000-000000000004',
      '30303030-0000-4000-8000-000000000003',
      '10101010-0000-4000-8000-000000000001',
      5,
      5,
      320,
      'retail',
      'Phase 10 mock analytics order line.',
      250,
      'paid',
      admin_user_id,
      '2026-07-03T11:30:00Z',
      'Mock commission for analytics.',
      '2026-07-03T11:00:00Z',
      '2026-07-03T13:00:00Z'
    ),
    (
      '40404040-0000-4000-8000-000000000005',
      '30303030-0000-4000-8000-000000000004',
      '10101010-0000-4000-8000-000000000002',
      3,
      3,
      180,
      'retail',
      'Phase 10 mock analytics order line.',
      90,
      'set',
      admin_user_id,
      '2026-06-28T10:30:00Z',
      'Mock commission for analytics.',
      '2026-06-28T10:00:00Z',
      '2026-06-28T10:30:00Z'
    ),
    (
      '40404040-0000-4000-8000-000000000006',
      '30303030-0000-4000-8000-000000000005',
      '10101010-0000-4000-8000-000000000003',
      2,
      2,
      230,
      'retail',
      'Phase 10 mock analytics order line.',
      0,
      'unset',
      null,
      null,
      null,
      '2026-07-04T08:00:00Z',
      '2026-07-04T08:00:00Z'
    )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    partial_quantity = excluded.partial_quantity,
    final_quantity = excluded.final_quantity,
    unit_price = excluded.unit_price,
    price_type = excluded.price_type,
    add_details = excluded.add_details,
    agent_commission_amount = excluded.agent_commission_amount,
    agent_commission_status = excluded.agent_commission_status,
    agent_commission_set_by = excluded.agent_commission_set_by,
    agent_commission_set_at = excluded.agent_commission_set_at,
    agent_commission_notes = excluded.agent_commission_notes,
    updated_at = excluded.updated_at;

  insert into public.invoice (
    id,
    order_id,
    invoice_number,
    status,
    issued_at,
    due_at,
    created_at,
    updated_at
  )
  values
    ('50505050-0000-4000-8000-000000000001', '30303030-0000-4000-8000-000000000001', 'INV-PH10-0001', 'partially_paid', '2026-07-01T09:45:00Z', '2026-07-08T09:45:00Z', '2026-07-01T09:45:00Z', '2026-07-01T10:00:00Z'),
    ('50505050-0000-4000-8000-000000000002', '30303030-0000-4000-8000-000000000002', 'INV-PH10-0002', 'paid', '2026-07-02T10:45:00Z', '2026-07-09T10:45:00Z', '2026-07-02T10:45:00Z', '2026-07-02T12:00:00Z'),
    ('50505050-0000-4000-8000-000000000003', '30303030-0000-4000-8000-000000000003', 'INV-PH10-0003', 'paid', '2026-07-03T11:45:00Z', '2026-07-10T11:45:00Z', '2026-07-03T11:45:00Z', '2026-07-03T13:00:00Z'),
    ('50505050-0000-4000-8000-000000000004', '30303030-0000-4000-8000-000000000004', 'INV-PH10-0004', 'issued', '2026-06-28T10:45:00Z', '2026-07-05T10:45:00Z', '2026-06-28T10:45:00Z', '2026-06-28T10:45:00Z'),
    ('50505050-0000-4000-8000-000000000005', '30303030-0000-4000-8000-000000000005', 'INV-PH10-0005', 'draft', null, null, '2026-07-04T08:00:00Z', '2026-07-04T08:00:00Z')
  on conflict (order_id) do update
  set
    invoice_number = excluded.invoice_number,
    status = excluded.status,
    issued_at = excluded.issued_at,
    due_at = excluded.due_at,
    updated_at = excluded.updated_at;

  insert into public.payment (
    id,
    order_id,
    amount,
    payment_method,
    payment_date,
    recorded_by,
    reference_number,
    notes,
    created_at
  )
  values
    ('60606060-0000-4000-8000-000000000001', '30303030-0000-4000-8000-000000000001', 800, 'cash', '2026-07-01', admin_user_id, 'PH10-PAY-0001', 'Phase 10 mock partial payment.', '2026-07-01T10:00:00Z'),
    ('60606060-0000-4000-8000-000000000002', '30303030-0000-4000-8000-000000000002', 690, 'bank transfer', '2026-07-02', admin_user_id, 'PH10-PAY-0002', 'Phase 10 mock paid order.', '2026-07-02T12:00:00Z'),
    ('60606060-0000-4000-8000-000000000003', '30303030-0000-4000-8000-000000000003', 1600, 'cash', '2026-07-03', admin_user_id, 'PH10-PAY-0003', 'Phase 10 mock paid agent order.', '2026-07-03T13:00:00Z')
  on conflict (id) do update
  set
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    payment_date = excluded.payment_date,
    recorded_by = excluded.recorded_by,
    reference_number = excluded.reference_number,
    notes = excluded.notes,
    created_at = excluded.created_at;

  update public.customer_order
  set
    payment_status = case id
      when '30303030-0000-4000-8000-000000000001' then 'partial'
      when '30303030-0000-4000-8000-000000000002' then 'paid'
      when '30303030-0000-4000-8000-000000000003' then 'paid'
      when '30303030-0000-4000-8000-000000000004' then 'unpaid'
      when '30303030-0000-4000-8000-000000000005' then 'unpaid'
      else payment_status
    end
  where id in (
    '30303030-0000-4000-8000-000000000001',
    '30303030-0000-4000-8000-000000000002',
    '30303030-0000-4000-8000-000000000003',
    '30303030-0000-4000-8000-000000000004',
    '30303030-0000-4000-8000-000000000005'
  );

  insert into public.reseller_application (
    id,
    name,
    email,
    address,
    planned_transaction_type,
    expected_quantity_per_week,
    contact_number,
    message,
    application_status,
    email_delivery_status,
    price_list_sent_at,
    email_error,
    internal_notes,
    created_at,
    updated_at
  )
  values
    ('70707070-0000-4000-8000-000000000001', 'Phase 10 Reseller One', 'phase10-reseller-1@example.test', 'Mock reseller address 1', 'retail_resale', '80 kg', '09170002001', 'Mock reseller lead for analytics.', 'submitted', 'sent', '2026-07-04T09:00:00Z', null, null, '2026-07-04T08:45:00Z', '2026-07-04T09:00:00Z'),
    ('70707070-0000-4000-8000-000000000002', 'Phase 10 Reseller Two', 'phase10-reseller-2@example.test', 'Mock reseller address 2', 'restaurant_supply', '120 kg', '09170002002', 'Mock contacted reseller lead for analytics.', 'contacted', 'sent', '2026-07-03T09:00:00Z', null, 'Called once.', '2026-07-03T08:45:00Z', '2026-07-03T09:00:00Z')
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    address = excluded.address,
    planned_transaction_type = excluded.planned_transaction_type,
    expected_quantity_per_week = excluded.expected_quantity_per_week,
    contact_number = excluded.contact_number,
    message = excluded.message,
    application_status = excluded.application_status,
    email_delivery_status = excluded.email_delivery_status,
    price_list_sent_at = excluded.price_list_sent_at,
    email_error = excluded.email_error,
    internal_notes = excluded.internal_notes,
    updated_at = excluded.updated_at;

  insert into public.contact_inquiry (
    id,
    name,
    email,
    phone_number,
    message,
    inquiry_status,
    internal_notes,
    created_at,
    updated_at
  )
  values
    ('80808080-0000-4000-8000-000000000001', 'Phase 10 Inquiry One', 'phase10-inquiry-1@example.test', '09170003001', 'Mock inquiry lead for analytics.', 'new', null, '2026-07-04T07:30:00Z', '2026-07-04T07:30:00Z'),
    ('80808080-0000-4000-8000-000000000002', 'Phase 10 Inquiry Two', 'phase10-inquiry-2@example.test', '09170003002', 'Mock responded inquiry for analytics.', 'responded', 'Response sent.', '2026-07-03T07:30:00Z', '2026-07-03T12:30:00Z')
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    phone_number = excluded.phone_number,
    message = excluded.message,
    inquiry_status = excluded.inquiry_status,
    internal_notes = excluded.internal_notes,
    updated_at = excluded.updated_at;
end
$$;

alter table public.invoice enable trigger validate_invoice_status_transition;
