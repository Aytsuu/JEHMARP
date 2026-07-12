create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.admin_role
      where user_id = (select auth.uid())
        and status = 'active'
    ),
    false
  );
$$;
create or replace function private.current_agent_profile_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;
create or replace function private.is_agent()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select private.current_agent_profile_id()) is not null;
$$;
create or replace function private.agent_can_access_order(target_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.customer_order
      left join public.customer on customer.id = customer_order.customer_id
      where customer_order.id = target_order_id
        and (
          customer_order.agent_id = (select private.current_agent_profile_id())
          or customer.assigned_agent_id = (select private.current_agent_profile_id())
        )
    ),
    false
  );
$$;
revoke all on function private.is_admin() from public;
revoke all on function private.current_agent_profile_id() from public;
revoke all on function private.is_agent() from public;
revoke all on function private.agent_can_access_order(uuid) from public;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.current_agent_profile_id() to authenticated, service_role;
grant execute on function private.is_agent() to authenticated, service_role;
grant execute on function private.agent_can_access_order(uuid) to authenticated, service_role;
alter table public.profile enable row level security;
alter table public.admin_role enable row level security;
alter table public.agent_profile enable row level security;
alter table public.customer enable row level security;
alter table public.product enable row level security;
alter table public.customer_order enable row level security;
alter table public.customer_order_item enable row level security;
alter table public.payment enable row level security;
alter table public.invoice enable row level security;
alter table public.customer_order_status_history enable row level security;
alter table public.customer_order_update enable row level security;
alter table public.contact_inquiry enable row level security;
alter table public.reseller_application enable row level security;
alter table public.page enable row level security;
alter table public.page_section enable row level security;
alter table public.media_asset enable row level security;
alter table public.analytics_daily enable row level security;
alter table public.analytics_product_daily enable row level security;
alter table public.analytics_agent_daily enable row level security;
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant usage, select on sequence public.invoice_number_seq to authenticated;
grant select (id, slug, title, status, published_at, created_at, updated_at)
  on public.page to anon, authenticated;
grant select (id, page_id, type, sort_order, content, status, created_at, updated_at)
  on public.page_section to anon, authenticated;
grant select (
  id,
  name,
  category,
  description,
  unit_label,
  default_price,
  stock_status,
  image_path,
  is_active,
  created_at,
  updated_at
) on public.product to anon, authenticated;
grant insert (name, email, phone_number, message)
  on public.contact_inquiry to anon, authenticated;
grant select, insert, update, delete on public.profile to authenticated;
grant select, insert, update, delete on public.admin_role to authenticated;
grant select, insert, update, delete on public.agent_profile to authenticated;
grant select, insert, update, delete on public.customer to authenticated;
grant insert, update, delete on public.product to authenticated;
grant select, insert, update, delete on public.customer_order to authenticated;
grant select, insert, update, delete on public.customer_order_item to authenticated;
grant select, insert, update, delete on public.payment to authenticated;
grant select, insert, update, delete on public.invoice to authenticated;
grant select, insert, update, delete on public.customer_order_status_history to authenticated;
grant select, insert, update, delete on public.customer_order_update to authenticated;
grant select, update, delete on public.contact_inquiry to authenticated;
grant select, insert, update, delete on public.reseller_application to authenticated;
grant insert, update, delete on public.page to authenticated;
grant insert, update, delete on public.page_section to authenticated;
grant select, insert, update, delete on public.media_asset to authenticated;
grant select, insert, update, delete on public.analytics_daily to authenticated;
grant select, insert, update, delete on public.analytics_product_daily to authenticated;
grant select, insert, update, delete on public.analytics_agent_daily to authenticated;
create policy "Users can read own profile"
on public.profile
for select
to authenticated
using (id = (select auth.uid()));
create policy "Users can update own profile"
on public.profile
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
create policy "Admins can manage profiles"
on public.profile
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins can manage admin roles"
on public.admin_role
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read own agent profile"
on public.agent_profile
for select
to authenticated
using (user_id = (select auth.uid()));
create policy "Admins can manage agent profiles"
on public.agent_profile
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read assigned customers"
on public.customer
for select
to authenticated
using (assigned_agent_id = (select private.current_agent_profile_id()));
create policy "Admins can manage customers"
on public.customer
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Active products are public"
on public.product
for select
to anon, authenticated
using (is_active = true);
create policy "Admins can manage products"
on public.product
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read accessible orders"
on public.customer_order
for select
to authenticated
using ((select private.agent_can_access_order(id)));
create policy "Admins can manage orders"
on public.customer_order
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read accessible order items"
on public.customer_order_item
for select
to authenticated
using ((select private.agent_can_access_order(order_id)));
create policy "Admins can manage order items"
on public.customer_order_item
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read accessible payments"
on public.payment
for select
to authenticated
using ((select private.agent_can_access_order(order_id)));
create policy "Admins can manage payments"
on public.payment
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read accessible invoices"
on public.invoice
for select
to authenticated
using ((select private.agent_can_access_order(order_id)));
create policy "Admins can manage invoices"
on public.invoice
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read accessible order status history"
on public.customer_order_status_history
for select
to authenticated
using ((select private.agent_can_access_order(order_id)));
create policy "Admins can manage order status history"
on public.customer_order_status_history
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read accessible order updates"
on public.customer_order_update
for select
to authenticated
using ((select private.agent_can_access_order(order_id)));
create policy "Admins can manage order updates"
on public.customer_order_update
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Guests can create contact inquiries"
on public.contact_inquiry
for insert
to anon, authenticated
with check (
  inquiry_status = 'new'
  and internal_notes is null
);
create policy "Admins can manage contact inquiries"
on public.contact_inquiry
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins can manage reseller applications"
on public.reseller_application
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Published pages are public"
on public.page
for select
to anon, authenticated
using (status = 'published');
create policy "Admins can manage pages"
on public.page
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Published page sections are public"
on public.page_section
for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.page
    where page.id = page_section.page_id
      and page.status = 'published'
  )
);
create policy "Admins can manage page sections"
on public.page_section
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins can manage media assets"
on public.media_asset
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins can manage daily analytics"
on public.analytics_daily
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins can manage product analytics"
on public.analytics_product_daily
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Agents can read own commission metrics"
on public.analytics_agent_daily
for select
to authenticated
using (agent_id = (select private.current_agent_profile_id()));
create policy "Admins can manage agent analytics"
on public.analytics_agent_daily
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
