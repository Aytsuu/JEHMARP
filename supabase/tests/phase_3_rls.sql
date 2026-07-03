do $$
declare
  missing_count integer;
begin
  select count(*)
  into missing_count
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and pg_class.relkind = 'r'
    and pg_class.relname in (
      'profile',
      'admin_role',
      'agent_profile',
      'customer',
      'product',
      'customer_order',
      'customer_order_item',
      'payment',
      'invoice',
      'customer_order_status_history',
      'contact_inquiry',
      'reseller_application',
      'page',
      'page_section',
      'media_asset',
      'analytics_daily',
      'analytics_product_daily',
      'analytics_agent_daily'
    )
    and not pg_class.relrowsecurity;

  if missing_count <> 0 then
    raise exception 'Expected RLS on all public application tables, found % disabled', missing_count;
  end if;

  if to_regprocedure('private.is_admin()') is null then
    raise exception 'Missing private.is_admin() helper';
  end if;

  if to_regprocedure('private.current_agent_profile_id()') is null then
    raise exception 'Missing private.current_agent_profile_id() helper';
  end if;

  if to_regprocedure('private.agent_can_access_order(uuid)') is null then
    raise exception 'Missing private.agent_can_access_order(uuid) helper';
  end if;

  if not has_column_privilege('anon', 'public.page', 'slug', 'select') then
    raise exception 'Expected anon read grant for public page columns';
  end if;

  if not has_column_privilege('anon', 'public.product', 'default_price', 'select') then
    raise exception 'Expected anon read grant for product.default_price';
  end if;

  if has_column_privilege('anon', 'public.product', 'reseller_price', 'select') then
    raise exception 'anon must not be able to read product.reseller_price';
  end if;

  if has_column_privilege('authenticated', 'public.product', 'reseller_price', 'select') then
    raise exception 'authenticated must not be able to read product.reseller_price directly';
  end if;

  if has_table_privilege('anon', 'public.customer_order', 'select') then
    raise exception 'anon must not be able to read customer_order';
  end if;

  if not has_column_privilege('anon', 'public.contact_inquiry', 'message', 'insert') then
    raise exception 'Expected anon insert grant for contact_inquiry.message';
  end if;

  if has_table_privilege('anon', 'public.reseller_application', 'insert') then
    raise exception 'reseller_application must use the trusted server workflow, not direct anon insert';
  end if;

  if has_table_privilege('anon', 'public.customer_order', 'insert') then
    raise exception 'guest order creation must use the trusted server workflow, not direct anon insert';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product'
      and policyname = 'Admins can manage products'
  ) then
    raise exception 'Missing admin product management policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer'
      and policyname = 'Agents can read assigned customers'
  ) then
    raise exception 'Missing agent assigned customer policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_agent_daily'
      and policyname = 'Agents can read own commission metrics'
  ) then
    raise exception 'Missing agent commission metrics policy';
  end if;
end $$;
