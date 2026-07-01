do $$
declare
  admin_user_id constant uuid := '11111111-1111-1111-1111-111111111111';
  agent_user_id constant uuid := '22222222-2222-2222-2222-222222222222';
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
  values
    (
      auth_instance_id,
      admin_user_id,
      'authenticated',
      'authenticated',
      'admin@nmc.test',
      extensions.crypt('NmcTest123!', extensions.gen_salt('bf')),
      seeded_at,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"NMC Admin"}'::jsonb,
      seeded_at,
      seeded_at
    ),
    (
      auth_instance_id,
      agent_user_id,
      'authenticated',
      'authenticated',
      'agent@nmc.test',
      extensions.crypt('NmcTest123!', extensions.gen_salt('bf')),
      seeded_at,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"NMC Agent"}'::jsonb,
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
  values
    (
      'admin@nmc.test',
      admin_user_id,
      '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@nmc.test","email_verified":true}'::jsonb,
      'email',
      seeded_at,
      seeded_at,
      seeded_at
    ),
    (
      'agent@nmc.test',
      agent_user_id,
      '{"sub":"22222222-2222-2222-2222-222222222222","email":"agent@nmc.test","email_verified":true}'::jsonb,
      'email',
      seeded_at,
      seeded_at,
      seeded_at
    )
  on conflict (provider_id, provider) do nothing;

  insert into public.profile (id, display_name, created_at, updated_at)
  values
    (admin_user_id, 'NMC Admin', seeded_at, seeded_at),
    (agent_user_id, 'NMC Agent', seeded_at, seeded_at)
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

  insert into public.agent_profile (user_id, display_name, status, created_at, updated_at)
  values (agent_user_id, 'NMC Agent', 'active', seeded_at, seeded_at)
  on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = excluded.updated_at;
end
$$;;
