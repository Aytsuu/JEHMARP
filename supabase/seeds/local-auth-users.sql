do $$
declare
  admin_user_id constant uuid := '11111111-1111-1111-1111-111111111111';
  auth_instance_id constant uuid := '00000000-0000-0000-0000-000000000000';
  seeded_at timestamptz := now();
begin
  alter table public.payment disable trigger block_payment_mutation;

  delete from public.payment;
  delete from public.invoice;
  delete from public.customer_order_status_history;
  delete from public.customer_order_item;
  delete from public.customer_order;
  delete from public.analytics_product_daily;
  delete from public.analytics_agent_daily;
  delete from public.analytics_daily;
  delete from public.contact_inquiry;
  delete from public.reseller_application;
  delete from public.customer;
  delete from public.product;
  delete from public.agent_profile;
  delete from public.admin_role
  where user_id <> admin_user_id;
  delete from public.profile
  where id <> admin_user_id;

  alter table public.payment enable trigger block_payment_mutation;

  delete from auth.identities
  where provider = 'email'
    and provider_id in (
      'admin@nmc.test',
      'agent@nmc.test',
      '22222222-2222-2222-2222-222222222222'
    );

  delete from auth.users
  where id = '22222222-2222-2222-2222-222222222222';

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      auth_instance_id,
      admin_user_id,
      'authenticated',
      'authenticated',
      'admin@nmc.test',
      extensions.crypt('NmcTestAdmin!2026', extensions.gen_salt('bf')),
      seeded_at,
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"email":"admin@nmc.test","email_verified":true,"phone_verified":false,"sub":"11111111-1111-1111-1111-111111111111","display_name":"NMC Admin"}'::jsonb,
      seeded_at,
      seeded_at
    )
  on conflict (id) do update
  set
    instance_id = excluded.instance_id,
    aud = excluded.aud,
    role = excluded.role,
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    confirmation_token = excluded.confirmation_token,
    recovery_token = excluded.recovery_token,
    email_change_token_new = excluded.email_change_token_new,
    email_change = excluded.email_change,
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
  values
    (
      admin_user_id::text,
      admin_user_id,
      '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@nmc.test","email_verified":true,"phone_verified":false}'::jsonb,
      'email',
      seeded_at,
      seeded_at,
      seeded_at
    )
  on conflict (provider_id, provider) do update
  set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    last_sign_in_at = excluded.last_sign_in_at,
    updated_at = excluded.updated_at;

  insert into public.profile (id, display_name, created_at, updated_at)
  values
    (admin_user_id, 'NMC Admin', seeded_at, seeded_at)
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    updated_at = excluded.updated_at;

  insert into public.admin_role (user_id, role, status, created_at, updated_at)
  values (admin_user_id, 'owner', 'active', seeded_at, seeded_at)
  on conflict (user_id) do update
  set
    role = excluded.role,
    status = excluded.status,
    updated_at = excluded.updated_at;
end
$$;;
