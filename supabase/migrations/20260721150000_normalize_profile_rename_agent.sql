-- Phase 1: normalize profile as identity SSOT and rename agent_profile -> agent (local only).

alter table public.profile drop constraint if exists profile_id_fkey;

alter table public.profile
  add column if not exists user_id uuid,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone_number text,
  add column if not exists address text;

update public.profile
set user_id = id
where user_id is null;

alter table public.profile
  alter column id set default extensions.gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profile_user_id_fkey'
  ) then
    alter table public.profile
      add constraint profile_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete set null;
  end if;
end $$;

create unique index if not exists profile_user_id_unique_idx
  on public.profile (user_id)
  where user_id is not null;

alter table public.customer
  add column if not exists profile_id uuid;

alter table public.agent_profile
  add column if not exists profile_id uuid;

with pending_customers as (
  select
    customer.id as customer_id,
    extensions.gen_random_uuid() as new_profile_id,
    customer.first_name,
    customer.last_name,
    customer.email,
    customer.phone_number,
    customer.address
  from public.customer
  where customer.profile_id is null
),
inserted_profiles as (
  insert into public.profile (
    id,
    first_name,
    last_name,
    display_name,
    email,
    phone_number,
    address
  )
  select
    pending_customers.new_profile_id,
    pending_customers.first_name,
    pending_customers.last_name,
    trim(concat_ws(' ', pending_customers.first_name, pending_customers.last_name)),
    pending_customers.email,
    pending_customers.phone_number,
    pending_customers.address
  from pending_customers
  returning id
)
update public.customer
set profile_id = pending_customers.new_profile_id
from pending_customers
where customer.id = pending_customers.customer_id;

update public.agent_profile
set profile_id = customer.profile_id
from public.customer
where agent_profile.customer_id = customer.id
  and agent_profile.profile_id is null
  and customer.profile_id is not null;

update public.agent_profile
set profile_id = profile.id
from public.profile
where agent_profile.user_id is not null
  and profile.user_id = agent_profile.user_id
  and agent_profile.profile_id is null;

update public.profile
set
  first_name = coalesce(nullif(profile.first_name, ''), agent_profile.first_name),
  last_name = coalesce(nullif(profile.last_name, ''), agent_profile.last_name),
  display_name = coalesce(nullif(profile.display_name, ''), agent_profile.display_name),
  phone_number = coalesce(nullif(profile.phone_number, ''), agent_profile.contact),
  updated_at = now()
from public.agent_profile
where agent_profile.profile_id = profile.id;

with pending_agents as (
  select
    agent_profile.id as agent_id,
    extensions.gen_random_uuid() as new_profile_id,
    agent_profile.first_name,
    agent_profile.last_name,
    agent_profile.display_name,
    agent_profile.contact,
    agent_profile.user_id
  from public.agent_profile
  where agent_profile.profile_id is null
),
inserted_profiles as (
  insert into public.profile (
    id,
    first_name,
    last_name,
    display_name,
    phone_number,
    user_id
  )
  select
    pending_agents.new_profile_id,
    pending_agents.first_name,
    pending_agents.last_name,
    pending_agents.display_name,
    pending_agents.contact,
    pending_agents.user_id
  from pending_agents
  returning id
)
update public.agent_profile
set profile_id = pending_agents.new_profile_id
from pending_agents
where agent_profile.id = pending_agents.agent_id;

alter table public.customer
  alter column profile_id set not null;

alter table public.agent_profile
  alter column profile_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_profile_id_fkey'
  ) then
    alter table public.customer
      add constraint customer_profile_id_fkey
      foreign key (profile_id) references public.profile (id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_profile_id_key'
  ) then
    alter table public.customer
      add constraint customer_profile_id_key unique (profile_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agent_profile_profile_id_fkey'
  ) then
    alter table public.agent_profile
      add constraint agent_profile_profile_id_fkey
      foreign key (profile_id) references public.profile (id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agent_profile_profile_id_key'
  ) then
    alter table public.agent_profile
      add constraint agent_profile_profile_id_key unique (profile_id);
  end if;
end $$;

create index if not exists customer_profile_id_idx
  on public.customer using btree (profile_id);

create index if not exists agent_profile_profile_id_idx
  on public.agent_profile using btree (profile_id);

alter table public.agent_profile rename to agent;

alter table public.agent rename constraint agent_profile_pkey to agent_pkey;
alter table public.agent rename constraint agent_profile_status_check to agent_status_check;
alter table public.agent rename constraint agent_profile_contact_key to agent_contact_key;
alter table public.agent rename constraint agent_profile_user_id_key to agent_user_id_key;
alter table public.agent rename constraint agent_profile_user_id_fkey to agent_user_id_fkey;
alter table public.agent rename constraint agent_profile_employee_id_key to agent_employee_id_key;
alter table public.agent rename constraint agent_profile_customer_id_fkey to agent_customer_id_fkey;
alter table public.agent rename constraint agent_profile_customer_id_key to agent_customer_id_key;
alter table public.agent rename constraint agent_profile_profile_id_fkey to agent_profile_id_fkey;
alter table public.agent rename constraint agent_profile_profile_id_key to agent_profile_id_key;

alter index if exists agent_profile_contact_idx rename to agent_contact_idx;
alter index if exists agent_profile_name_idx rename to agent_name_idx;
alter index if exists agent_profile_customer_id_idx rename to agent_customer_id_idx;
alter index if exists agent_profile_profile_id_idx rename to agent_profile_id_idx;

alter policy "Admins can manage agent profiles" on public.agent
  rename to "Admins can manage agents";

alter policy "Agents can read own agent profile" on public.agent
  rename to "Agents can read own agent";

drop policy if exists "Users can read own profile" on public.profile;
create policy "Users can read own profile"
  on public.profile
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can update own profile" on public.profile;
create policy "Users can update own profile"
  on public.profile
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function private.sync_customer_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.profile_id is null then
    insert into public.profile (
      first_name,
      last_name,
      display_name,
      email,
      phone_number,
      address
    )
    values (
      new.first_name,
      new.last_name,
      trim(concat_ws(' ', new.first_name, new.last_name)),
      new.email,
      new.phone_number,
      new.address
    )
    returning id into new.profile_id;
  elsif new.profile_id is not null then
    update public.profile
    set
      first_name = new.first_name,
      last_name = new.last_name,
      display_name = trim(concat_ws(' ', new.first_name, new.last_name)),
      email = new.email,
      phone_number = new.phone_number,
      address = new.address,
      updated_at = now()
    where id = new.profile_id;
  end if;

  return new;
end;
$$;

create or replace function private.sync_agent_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is null and new.customer_id is not null then
    select customer.profile_id
    into new.profile_id
    from public.customer
    where customer.id = new.customer_id;
  end if;

  if new.profile_id is null and new.user_id is not null then
    select profile.id
    into new.profile_id
    from public.profile
    where profile.user_id = new.user_id
    limit 1;
  end if;

  if tg_op = 'INSERT' and new.profile_id is null then
    insert into public.profile (
      first_name,
      last_name,
      display_name,
      phone_number,
      user_id
    )
    values (
      new.first_name,
      new.last_name,
      new.display_name,
      new.contact,
      new.user_id
    )
    returning id into new.profile_id;
  elsif new.profile_id is not null then
    update public.profile
    set
      first_name = new.first_name,
      last_name = new.last_name,
      display_name = new.display_name,
      phone_number = new.contact,
      user_id = coalesce(new.user_id, profile.user_id),
      updated_at = now()
    where id = new.profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_customer_profile_identity on public.customer;
create trigger sync_customer_profile_identity
  before insert or update of first_name, last_name, phone_number, email, address, profile_id
  on public.customer
  for each row
  execute function private.sync_customer_profile_identity();

drop trigger if exists sync_agent_profile_identity on public.agent;
create trigger sync_agent_profile_identity
  before insert or update of first_name, last_name, display_name, contact, user_id, customer_id, profile_id
  on public.agent
  for each row
  execute function private.sync_agent_profile_identity();

create or replace function private.current_agent_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.agent
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;

create or replace function "public"."list_admin_order_rows"(
  "search_query" "text" default null,
  "source_filter" "text" default null,
  "order_status_filter" "text" default null,
  "payment_status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(source_filter, '') as source_value,
      nullif(order_status_filter, '') as order_status_value,
      nullif(payment_status_filter, '') as payment_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  customer_order_totals as (
    select
      customer_order.id as order_id,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then customer_order_item.partial_quantity
              else customer_order_item.final_quantity
            end * customer_order_item.unit_price
          ),
          0
        ),
        2
      ) as total_amount
    from public.customer_order
    left join public.invoice
      on invoice.order_id = customer_order.id
    left join public.customer_order_item
      on customer_order_item.order_id = customer_order.id
    group by customer_order.id
  ),
  agent_order_totals as (
    select
      agent_order.id as order_id,
      round(coalesce(sum(agent_order_item.quantity * product.default_price), 0), 2) as total_amount
    from public.agent_order
    left join public.agent_order_item
      on agent_order_item.agent_order_id = agent_order.id
    left join public.product
      on product.id = agent_order_item.product_id
    group by agent_order.id
  ),
  agent_order_payment as (
    select
      agent_order.id as order_id,
      count(customer_order.id)::integer as linked_customer_count,
      case
        when count(customer_order.id) = 0 then 'unpaid'
        when bool_and(customer_order.payment_status = 'paid') then 'paid'
        when bool_and(customer_order.payment_status = 'unpaid') then 'unpaid'
        else 'partial'
      end as payment_status
    from public.agent_order
    left join public.customer_order
      on customer_order.agent_order_id = agent_order.id
    group by agent_order.id
  ),
  agent_order_customer_search as (
    select
      customer_order.agent_order_id as agent_order_id,
      lower(string_agg(
        trim(concat_ws(
          ' ',
          customer.first_name,
          customer.last_name,
          customer.phone_number,
          customer.email,
          customer.address
        )),
        ' '
      )) as customer_search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    where customer_order.agent_order_id is not null
    group by customer_order.agent_order_id
  ),
  unified as (
    select
      agent_order.id,
      'agent'::text as row_type,
      agent_order.created_at,
      null::date as release_date,
      agent_order.order_status as status,
      coalesce(agent_profile.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      agent_order_payment.payment_status,
      coalesce(agent_order_totals.total_amount, 0) as total_amount,
      '/admin/orders/agent/' || agent_order.id::text as href,
      agent_order_payment.linked_customer_count,
      lower(concat_ws(
        ' ',
        agent_order.order_status,
        agent_profile.display_name,
        agent_profile.contact,
        agent_order_customer_search.customer_search_text
      )) as search_text
    from public.agent_order
    join public.agent as agent_profile
      on agent_profile.id = agent_order.agent_id
    left join agent_order_totals
      on agent_order_totals.order_id = agent_order.id
    left join agent_order_payment
      on agent_order_payment.order_id = agent_order.id
    left join agent_order_customer_search
      on agent_order_customer_search.agent_order_id = agent_order.id

    union all

    select
      customer_order.id,
      'customer'::text as row_type,
      customer_order.created_at,
      customer_order.release_date,
      customer_order.order_status as status,
      concat_ws(' ', customer.first_name, customer.last_name) as customer_label,
      customer_order.source,
      case customer_order.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(customer_order.source, '_', ' '))
      end as source_label,
      customer_order.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      '/admin/orders/customer/' || customer_order.id::text as href,
      null::integer as linked_customer_count,
      lower(concat_ws(
        ' ',
        customer_order.source,
        customer_order.order_status,
        customer_order.payment_status,
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name
      )) as search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    left join public.agent as agent_profile
      on agent_profile.id = customer_order.agent_id
    left join customer_order_totals
      on customer_order_totals.order_id = customer_order.id
    where customer_order.agent_order_id is null
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where not (unified.status = 'closed' and unified.payment_status = 'paid')
      and (normalized.search_value is null or unified.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or unified.source = normalized.source_value)
      and (normalized.order_status_value is null or unified.status = normalized.order_status_value)
      and (normalized.payment_status_value is null or unified.payment_status = normalized.payment_status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.created_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'source' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

create or replace function "public"."list_admin_order_rows"(
  "search_query" "text" default null,
  "source_filter" "text" default null,
  "order_status_filter" "text" default null,
  "payment_status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(source_filter, '') as source_value,
      nullif(order_status_filter, '') as order_status_value,
      nullif(payment_status_filter, '') as payment_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  customer_order_totals as (
    select
      customer_order.id as order_id,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then customer_order_item.partial_quantity
              else customer_order_item.final_quantity
            end * customer_order_item.unit_price
          ),
          0
        ),
        2
      ) as total_amount
    from public.customer_order
    left join public.invoice
      on invoice.order_id = customer_order.id
    left join public.customer_order_item
      on customer_order_item.order_id = customer_order.id
    group by customer_order.id
  ),
  agent_order_totals as (
    select
      agent_order.id as order_id,
      round(coalesce(sum(agent_order_item.quantity * product.default_price), 0), 2) as total_amount
    from public.agent_order
    left join public.agent_order_item
      on agent_order_item.agent_order_id = agent_order.id
    left join public.product
      on product.id = agent_order_item.product_id
    group by agent_order.id
  ),
  agent_order_payment as (
    select
      agent_order.id as order_id,
      count(customer_order.id)::integer as linked_customer_count,
      case
        when count(customer_order.id) = 0 then 'unpaid'
        when bool_and(customer_order.payment_status = 'paid') then 'paid'
        when bool_and(customer_order.payment_status = 'unpaid') then 'unpaid'
        else 'partial'
      end as payment_status
    from public.agent_order
    left join public.customer_order
      on customer_order.agent_order_id = agent_order.id
    group by agent_order.id
  ),
  unified as (
    select
      agent_order.id,
      'agent'::text as row_type,
      agent_order.created_at,
      null::date as release_date,
      agent_order.order_status as status,
      coalesce(agent_profile.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      agent_order_payment.payment_status,
      coalesce(agent_order_totals.total_amount, 0) as total_amount,
      '/admin/orders/agent/' || agent_order.id::text as href,
      agent_order_payment.linked_customer_count,
      lower(concat_ws(
        ' ',
        agent_order.order_status,
        agent_profile.display_name,
        agent_profile.contact
      )) as search_text
    from public.agent_order
    join public.agent as agent_profile
      on agent_profile.id = agent_order.agent_id
    left join agent_order_totals
      on agent_order_totals.order_id = agent_order.id
    left join agent_order_payment
      on agent_order_payment.order_id = agent_order.id

    union all

    select
      customer_order.id,
      'customer'::text as row_type,
      customer_order.created_at,
      customer_order.release_date,
      customer_order.order_status as status,
      concat_ws(' ', customer.first_name, customer.last_name) as customer_label,
      customer_order.source,
      case customer_order.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(customer_order.source, '_', ' '))
      end as source_label,
      customer_order.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      '/admin/orders/customer/' || customer_order.id::text as href,
      null::integer as linked_customer_count,
      lower(concat_ws(
        ' ',
        customer_order.source,
        customer_order.order_status,
        customer_order.payment_status,
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name
      )) as search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    left join public.agent as agent_profile
      on agent_profile.id = customer_order.agent_id
    left join customer_order_totals
      on customer_order_totals.order_id = customer_order.id
    where customer_order.agent_order_id is null
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where not (unified.status = 'closed' and unified.payment_status = 'paid')
      and (normalized.search_value is null or unified.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or unified.source = normalized.source_value)
      and (normalized.order_status_value is null or unified.status = normalized.order_status_value)
      and (normalized.payment_status_value is null or unified.payment_status = normalized.payment_status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.created_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'source' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

create or replace function "public"."list_admin_sales_rows"(
  "search_query" "text" default null,
  "source_filter" "text" default null,
  "order_status_filter" "text" default null,
  "payment_status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(source_filter, '') as source_value,
      nullif(order_status_filter, '') as order_status_value,
      nullif(payment_status_filter, '') as payment_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer_order.id,
      customer_order.created_at,
      coalesce(latest_payment.sale_date::text, customer_order.updated_at::text) as sale_date,
      customer_order.release_date,
      concat_ws(' ', customer.first_name, customer.last_name) as customer_label,
      customer_order.source,
      case customer_order.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(customer_order.source, '_', ' '))
      end as source_label,
      customer_order.order_status,
      customer_order.payment_status,
      invoice.invoice_number,
      coalesce(public.compute_invoice_total(customer_order.id), 0) as order_total,
      coalesce(public.compute_payment_total(customer_order.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(customer_order.id), 0) as balance,
      '/admin/orders/customer/' || customer_order.id::text as href,
      lower(concat_ws(
        ' ',
        customer_order.source,
        customer_order.order_status,
        customer_order.payment_status,
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name,
        invoice.invoice_number
      )) as search_text
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    left join public.agent as agent_profile
      on agent_profile.id = customer_order.agent_id
    left join lateral (
      select invoice.invoice_number
      from public.invoice
      where invoice.order_id = customer_order.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) invoice on true
    left join lateral (
      select max(payment.payment_date) as sale_date
      from public.payment
      where payment.order_id = customer_order.id
    ) latest_payment on true
    where customer_order.order_status = 'closed'
      and customer_order.payment_status = 'paid'
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or base_rows.source = normalized.source_value)
      and (normalized.order_status_value is null or base_rows.order_status = normalized.order_status_value)
      and (normalized.payment_status_value is null or base_rows.payment_status = normalized.payment_status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.created_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'source' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

create or replace function "public"."list_admin_customer_rows"(
  "search_query" "text" default null,
  "customer_type_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  security definer
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(customer_type_filter, '') as customer_type_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer.id,
      customer.first_name,
      customer.last_name,
      customer.phone_number,
      customer.email,
      customer.address,
      customer.assigned_agent_id,
      customer.is_reseller,
      customer.credit_limit,
      customer.credit_limit_exceeded,
      private.compute_customer_credit_balance(customer.id) as outstanding_credit_balance,
      customer.created_at,
      customer.updated_at,
      agent_profile.display_name as assigned_agent_name,
      exists (
        select 1
        from public.agent as customer_agent
        where customer_agent.customer_id = customer.id
      ) as is_agent,
      lower(concat_ws(
        ' ',
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name
      )) as search_text
    from public.customer
    left join public.agent as agent_profile
      on agent_profile.id = customer.assigned_agent_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (
        normalized.customer_type_value is null
        or (normalized.customer_type_value = 'reseller' and base_rows.is_reseller)
        or (normalized.customer_type_value = 'retail' and not base_rows.is_reseller)
      )
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.created_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

create or replace function "public"."list_admin_customer_rows"(
  "search_query" "text" default null,
  "customer_type_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  security definer
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(customer_type_filter, '') as customer_type_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer.id,
      customer.first_name,
      customer.last_name,
      customer.phone_number,
      customer.email,
      customer.address,
      customer.assigned_agent_id,
      customer.is_reseller,
      customer.created_at,
      customer.updated_at,
      agent_profile.display_name as assigned_agent_name,
      exists (
        select 1
        from public.agent as customer_agent
        where customer_agent.customer_id = customer.id
      ) as is_agent,
      lower(concat_ws(
        ' ',
        customer.first_name,
        customer.last_name,
        customer.phone_number,
        customer.email,
        customer.address,
        agent_profile.display_name
      )) as search_text
    from public.customer
    left join public.agent as agent_profile
      on agent_profile.id = customer.assigned_agent_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (
        normalized.customer_type_value is null
        or (normalized.customer_type_value = 'reseller' and base_rows.is_reseller)
        or (normalized.customer_type_value = 'retail' and not base_rows.is_reseller)
      )
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.created_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.created_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

create or replace function "public"."list_admin_agent_rows"(
  "search_query" "text" default null,
  "status_filter" "text" default null,
  "page_number" integer default 1,
  "page_size" integer default 10
) returns table("records" "jsonb", "total_rows" bigint)
  language "sql" stable
  security definer
  set "search_path" to ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(status_filter, '') as status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      agent_profile.id,
      agent_profile.user_id,
      agent_profile.customer_id,
      agent_profile.employee_id,
      agent_profile.first_name,
      agent_profile.last_name,
      agent_profile.display_name,
      agent_profile.status,
      auth_users.email,
      agent_profile.contact,
      agent_profile.created_at,
      agent_profile.updated_at,
      lower(concat_ws(
        ' ',
        agent_profile.employee_id,
        agent_profile.first_name,
        agent_profile.last_name,
        agent_profile.display_name,
        auth_users.email,
        agent_profile.contact,
        agent_profile.status
      )) as search_text
    from public.agent as agent_profile
    left join auth.users as auth_users
      on auth_users.id = agent_profile.user_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.status_value is null or base_rows.status = normalized.status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.last_name asc, counted.first_name asc, counted.id asc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.last_name asc, paged.first_name asc, paged.id asc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

create or replace function "public"."attach_customer_to_agent_order"(
  "target_agent_order_id" "uuid",
  "target_customer_id" "uuid",
  "item_payload" "jsonb",
  "customer_payload" "jsonb" default null::"jsonb",
  "require_approval" boolean default true
) returns "uuid"
  language "plpgsql"
  security definer
  set "search_path" to ''
  as $$
declare
  current_agent_id uuid;
  current_agent_customer_id uuid;
  resolved_customer_id uuid := target_customer_id;
  agent_order_agent_id uuid;
  agent_order_status text;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
  existing_item_quantity numeric;
  approved_distributed numeric;
  remaining_quantity numeric;
  quantity_increase numeric;
  order_status_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated user is required to attach a customer order.';
  end if;

  select agent_id, order_status
  into agent_order_agent_id, agent_order_status
  from public.agent_order
  where id = target_agent_order_id
  limit 1;

  if agent_order_agent_id is null then
    raise exception 'Agent order was not found.';
  end if;

  if agent_order_status = 'closed'
     and exists (
       select 1
       from public.customer_order
       where customer_order.agent_order_id = target_agent_order_id
     )
     and not exists (
       select 1
       from public.customer_order
       where customer_order.agent_order_id = target_agent_order_id
         and customer_order.payment_status is distinct from 'paid'
     ) then
    raise exception 'Completed and paid agent orders cannot accept new customers.';
  end if;

  if (select private.is_admin()) then
    current_agent_id := agent_order_agent_id;
  else
    select
      id,
      customer_id
    into
      current_agent_id,
      current_agent_customer_id
    from public.agent as agent_profile
    where user_id = (select auth.uid())
      and status = 'active'
    limit 1;

    if current_agent_id is null or current_agent_id <> agent_order_agent_id then
      raise exception 'Only the assigned agent can attach customer orders to this agent order.';
    end if;
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if resolved_customer_id is null then
    if customer_payload is null or jsonb_typeof(customer_payload) <> 'object' then
      raise exception 'Customer details are required for new agent customers.';
    end if;

    if nullif(trim(customer_payload ->> 'firstName'), '') is null then
      raise exception 'First name is required.';
    end if;

    if nullif(trim(customer_payload ->> 'lastName'), '') is null then
      raise exception 'Last name is required.';
    end if;

    if nullif(trim(customer_payload ->> 'phoneNumber'), '') is null then
      raise exception 'Phone number is required.';
    end if;

    if nullif(trim(customer_payload ->> 'address'), '') is null then
      raise exception 'Address is required.';
    end if;

    insert into public.customer (
      first_name,
      last_name,
      phone_number,
      email,
      address,
      assigned_agent_id,
      created_by
    )
    values (
      trim(customer_payload ->> 'firstName'),
      trim(customer_payload ->> 'lastName'),
      trim(customer_payload ->> 'phoneNumber'),
      nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
      trim(customer_payload ->> 'address'),
      current_agent_id,
      (select auth.uid())
    )
    returning id into resolved_customer_id;
  elsif not (select private.is_admin()) and not exists (
    select 1
    from public.customer
    where id = resolved_customer_id
      and (
        assigned_agent_id = current_agent_id
        or id = current_agent_customer_id
      )
  ) then
    raise exception 'Selected customer is not assigned to this agent.';
  end if;

  order_status_value := case
    when require_approval then 'pending'
    else 'processing'
  end;

  insert into public.customer_order (
    customer_id,
    agent_id,
    agent_order_id,
    source,
    order_status,
    payment_status,
    release_date,
    submitted_by,
    approved_by,
    approved_at
  )
  values (
    resolved_customer_id,
    current_agent_id,
    target_agent_order_id,
    case
      when (select private.is_admin()) then 'admin_manual'
      else 'agent_submitted'
    end,
    order_status_value,
    'unpaid',
    nullif(trim(coalesce(customer_payload ->> 'releaseDate', '')), '')::date,
    (select auth.uid()),
    case
      when require_approval then null
      else (select auth.uid())
    end,
    case
      when require_approval then null
      else now()
    end
  )
  returning id into inserted_order_id;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for agent ordering.', item_product_id;
    end if;

    select quantity
    into existing_item_quantity
    from public.agent_order_item
    where agent_order_id = target_agent_order_id
      and product_id = item_product_id
    limit 1;

    approved_distributed := private.agent_order_approved_distributed_quantity(
      target_agent_order_id,
      item_product_id
    );
    remaining_quantity := greatest(coalesce(existing_item_quantity, 0) - approved_distributed, 0);
    quantity_increase := greatest(item_quantity - remaining_quantity, 0);

    if not require_approval then
      perform private.apply_agent_order_item_quantity_increase(
        target_agent_order_id,
        item_product_id,
        case
          when existing_item_quantity is null then item_quantity
          else quantity_increase
        end,
        item_details
      );
    elsif existing_item_quantity is null then
      insert into public.agent_order_item (
        agent_order_id,
        product_id,
        quantity,
        add_details
      )
      values (
        target_agent_order_id,
        item_product_id,
        0,
        item_details
      );
    end if;

    insert into public.customer_order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      agent_order_quantity_increase
    )
    values (
      inserted_order_id,
      item_product_id,
      item_quantity,
      item_quantity,
      item_details,
      case
        when require_approval then
          case
            when existing_item_quantity is null then item_quantity
            else quantity_increase
          end
        else 0
      end
    );
  end loop;

  if not exists (
    select 1
    from public.customer_order_item
    where order_id = inserted_order_id
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  if not require_approval then
    perform public.apply_agent_order_customer_approval(inserted_order_id);
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Agent order customer payload contains an invalid product id, quantity, or release date.';
end;
$$;

create or replace function "public"."submit_agent_order"(
  "target_customer_id" "uuid",
  "item_payload" "jsonb",
  "customer_payload" "jsonb" default null::"jsonb"
) returns "uuid"
  language "plpgsql"
  security definer
  set "search_path" to ''
  as $$
declare
  current_agent_id uuid;
  current_agent_customer_id uuid;
  current_agent_first_name text;
  current_agent_last_name text;
  current_agent_contact text;
  resolved_customer_id uuid := target_customer_id;
  requested_release_date date := nullif(trim(coalesce(customer_payload ->> 'releaseDate', '')), '')::date;
  inserted_order_id uuid;
  inserted_agent_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
  is_personal_order boolean := coalesce(customer_payload ->> 'orderFor', '') = 'personal';
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select
    id,
    customer_id,
    first_name,
    last_name,
    contact
  into
    current_agent_id,
    current_agent_customer_id,
    current_agent_first_name,
    current_agent_last_name,
    current_agent_contact
  from public.agent as agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if resolved_customer_id is null
    and not is_personal_order
    and (
      customer_payload is null
      or (
        jsonb_typeof(customer_payload) = 'object'
        and nullif(trim(coalesce(customer_payload ->> 'firstName', '')), '') is null
        and nullif(trim(coalesce(customer_payload ->> 'lastName', '')), '') is null
        and nullif(trim(coalesce(customer_payload ->> 'phoneNumber', '')), '') is null
        and nullif(trim(coalesce(customer_payload ->> 'address', '')), '') is null
      )
    ) then
    insert into public.agent_order (
      agent_id,
      order_status,
      release_date,
      submitted_by
    )
    values (
      current_agent_id,
      'pending_customers',
      requested_release_date,
      (select auth.uid())
    )
    returning id into inserted_agent_order_id;
  else
    if is_personal_order then
      resolved_customer_id := current_agent_customer_id;

      if resolved_customer_id is null then
        insert into public.customer (
          first_name,
          last_name,
          phone_number,
          email,
          address,
          assigned_agent_id,
          created_by
        )
        values (
          trim(current_agent_first_name),
          trim(current_agent_last_name),
          trim(current_agent_contact),
          nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
          coalesce(nullif(trim(coalesce(customer_payload ->> 'address', '')), ''), 'Agent personal order'),
          current_agent_id,
          (select auth.uid())
        )
        returning id into resolved_customer_id;

        update public.agent
        set customer_id = resolved_customer_id,
            updated_at = now()
        where id = current_agent_id
          and customer_id is null;
      end if;
    elsif resolved_customer_id is null then
      if customer_payload is null or jsonb_typeof(customer_payload) <> 'object' then
        raise exception 'Customer details are required for new agent customers.';
      end if;

      if nullif(trim(customer_payload ->> 'firstName'), '') is null then
        raise exception 'First name is required.';
      end if;

      if nullif(trim(customer_payload ->> 'lastName'), '') is null then
        raise exception 'Last name is required.';
      end if;

      if nullif(trim(customer_payload ->> 'phoneNumber'), '') is null then
        raise exception 'Phone number is required.';
      end if;

      if nullif(trim(customer_payload ->> 'address'), '') is null then
        raise exception 'Address is required.';
      end if;

      insert into public.customer (
        first_name,
        last_name,
        phone_number,
        email,
        address,
        assigned_agent_id,
        created_by
      )
      values (
        trim(customer_payload ->> 'firstName'),
        trim(customer_payload ->> 'lastName'),
        trim(customer_payload ->> 'phoneNumber'),
        nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
        trim(customer_payload ->> 'address'),
        current_agent_id,
        (select auth.uid())
      )
      returning id into resolved_customer_id;
    elsif not exists (
      select 1
      from public.customer
      where id = resolved_customer_id
        and (
          assigned_agent_id = current_agent_id
          or id = current_agent_customer_id
        )
    ) then
      raise exception 'Selected customer is not assigned to this agent.';
    end if;

    insert into public.customer_order (
      customer_id,
      agent_id,
      source,
      order_status,
      payment_status,
      release_date,
      submitted_by
    )
    values (
      resolved_customer_id,
      current_agent_id,
      'agent_submitted',
      'pending',
      'unpaid',
      requested_release_date,
      (select auth.uid())
    )
    returning id into inserted_order_id;
  end if;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for agent ordering.', item_product_id;
    end if;

    if inserted_order_id is not null then
      insert into public.customer_order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details
      )
      values (
        inserted_order_id,
        item_product_id,
        item_quantity,
        item_quantity,
        item_details
      );
    else
      insert into public.agent_order_item (
        agent_order_id,
        product_id,
        quantity,
        add_details
      )
      values (
        inserted_agent_order_id,
        item_product_id,
        item_quantity,
        item_details
      );
    end if;
  end loop;

  if inserted_order_id is not null then
    if not exists (
      select 1
      from public.customer_order_item
      where order_id = inserted_order_id
    ) then
      raise exception 'At least one valid order item is required.';
    end if;

    return inserted_order_id;
  end if;

  if not exists (
    select 1
    from public.agent_order_item
    where agent_order_id = inserted_agent_order_id
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_agent_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Agent order payload contains an invalid product id, quantity, or release date.';
end;
$$;

create or replace function "public"."submit_agent_received_payment"(
  "target_order_id" uuid,
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_terms_value" text,
  "payment_date_value" date,
  "reference_number_value" text default null,
  "notes_value" text default null
) returns uuid
language "plpgsql"
security definer
set "search_path" to ''
as $$
declare
  current_agent_id uuid;
  inserted_payment_id uuid;
  invoice_exists boolean;
  base_balance numeric;
  pending_total numeric;
  remaining_recordable_balance numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to record received payment.';
  end if;

  select id
  into current_agent_id
  from public.agent as agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can record received payment.';
  end if;

  if not (select private.agent_can_access_order(target_order_id)) then
    raise exception 'This order is not assigned to the current agent.';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if payment_method_value not in ('Cash', 'Check') then
    raise exception 'Payment method is not supported.';
  end if;

  if payment_terms_value not in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash') then
    raise exception 'Payment terms is not supported.';
  end if;

  if payment_date_value is null then
    raise exception 'Payment date is required.';
  end if;

  select exists (
    select 1
    from public.invoice
    where invoice.order_id = target_order_id
  )
  into invoice_exists;

  base_balance := case
    when invoice_exists then coalesce(public.compute_payment_balance(target_order_id), 0)
    else greatest(
      coalesce(public.compute_order_total(target_order_id), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    )
  end;

  select coalesce(sum(amount), 0)
  into pending_total
  from public.agent_received_payment
  where order_id = target_order_id
    and status = 'pending_admin_confirmation';

  remaining_recordable_balance := greatest(base_balance - pending_total, 0);

  if round(payment_amount, 2) > round(remaining_recordable_balance, 2) then
    raise exception 'Payment amount exceeds the remaining order balance.';
  end if;

  insert into public.agent_received_payment (
    order_id,
    agent_id,
    amount,
    payment_method,
    payment_terms,
    payment_date,
    reference_number,
    notes,
    received_by
  )
  values (
    target_order_id,
    current_agent_id,
    round(payment_amount, 2),
    payment_method_value,
    payment_terms_value,
    payment_date_value,
    nullif(trim(reference_number_value), ''),
    nullif(trim(notes_value), ''),
    (select auth.uid())
  )
  returning id into inserted_payment_id;

  return inserted_payment_id;
end;
$$;

create or replace function "public"."submit_agent_received_payment_distribution"(
  "target_order_ids" uuid[],
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_terms_value" text,
  "payment_date_value" date,
  "reference_number_value" text default null,
  "notes_value" text default null
) returns uuid[]
language "plpgsql"
security definer
set "search_path" to ''
as $$
declare
  current_agent_id uuid;
  remaining_amount numeric;
  order_record record;
  invoice_exists boolean;
  base_balance numeric;
  pending_total numeric;
  recordable_balance numeric;
  amount_to_record numeric;
  inserted_payment_id uuid;
  inserted_payment_ids uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to distribute received payment.';
  end if;

  select id
  into current_agent_id
  from public.agent as agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can distribute received payment.';
  end if;

  if target_order_ids is null or cardinality(target_order_ids) = 0 then
    raise exception 'At least one customer order is required.';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if payment_method_value not in ('Cash', 'Check') then
    raise exception 'Payment method is not supported.';
  end if;

  if payment_terms_value not in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash') then
    raise exception 'Payment terms is not supported.';
  end if;

  if payment_date_value is null then
    raise exception 'Payment date is required.';
  end if;

  remaining_amount := round(payment_amount, 2);

  for order_record in
    with unique_selected_orders as (
      select distinct on (selected_order_id)
        selected_order_id as order_id,
        ordinal_position
      from unnest(target_order_ids) with ordinality as selected(selected_order_id, ordinal_position)
      where selected_order_id is not null
      order by selected_order_id, ordinal_position
    )
    select order_id, ordinal_position
    from unique_selected_orders
    order by ordinal_position
  loop
    exit when remaining_amount <= 0;

    if not (select private.agent_can_access_order(order_record.order_id)) then
      raise exception 'One or more selected orders are not assigned to the current agent.';
    end if;

    select exists (
      select 1
      from public.invoice
      where invoice.order_id = order_record.order_id
    )
    into invoice_exists;

    base_balance := case
      when invoice_exists then coalesce(public.compute_payment_balance(order_record.order_id), 0)
      else greatest(
        coalesce(public.compute_order_total(order_record.order_id), 0)
        - coalesce(public.compute_payment_total(order_record.order_id), 0),
        0
      )
    end;

    select coalesce(sum(amount), 0)
    into pending_total
    from public.agent_received_payment
    where order_id = order_record.order_id
      and status = 'pending_admin_confirmation';

    recordable_balance := round(greatest(base_balance - pending_total, 0), 2);

    if recordable_balance <= 0 then
      continue;
    end if;

    amount_to_record := least(remaining_amount, recordable_balance);

    insert into public.agent_received_payment (
      order_id,
      agent_id,
      amount,
      payment_method,
      payment_terms,
      payment_date,
      reference_number,
      notes,
      received_by
    )
    values (
      order_record.order_id,
      current_agent_id,
      amount_to_record,
      payment_method_value,
      payment_terms_value,
      payment_date_value,
      nullif(trim(reference_number_value), ''),
      nullif(trim(notes_value), ''),
      (select auth.uid())
    )
    returning id into inserted_payment_id;

    inserted_payment_ids := array_append(inserted_payment_ids, inserted_payment_id);
    remaining_amount := round(remaining_amount - amount_to_record, 2);
  end loop;

  if remaining_amount > 0 then
    raise exception 'Payment amount exceeds selected order balances.';
  end if;

  if cardinality(inserted_payment_ids) = 0 then
    raise exception 'Selected customer orders do not have remaining balances.';
  end if;

  return inserted_payment_ids;
end;
$$;

create or replace function "public"."confirm_agent_received_payment"(
  "agent_payment_id" uuid,
  "recorded_by_value" uuid
) returns uuid
language "plpgsql"
security definer
set "search_path" to ''
as $$
declare
  pending_payment public.agent_received_payment;
  inserted_payment_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to confirm payment.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can confirm agent received payments.';
  end if;

  select *
  into pending_payment
  from public.agent_received_payment
  where id = agent_payment_id
  for update;

  if pending_payment.id is null then
    raise exception 'Agent received payment was not found.';
  end if;

  if pending_payment.status <> 'pending_admin_confirmation' then
    raise exception 'Only pending agent received payments can be confirmed.';
  end if;

  if not exists (
    select 1
    from public.invoice
    where invoice.order_id = pending_payment.order_id
  ) then
    raise exception 'Create a sales invoice before confirming agent received payment.';
  end if;

  if round(pending_payment.amount, 2) > round(coalesce(public.compute_payment_balance(pending_payment.order_id), 0), 2) then
    raise exception 'Agent received payment exceeds the remaining order balance.';
  end if;

  insert into public.payment (
    order_id,
    amount,
    payment_method,
    payment_terms,
    payment_date,
    recorded_by,
    reference_number,
    notes
  )
  values (
    pending_payment.order_id,
    pending_payment.amount,
    pending_payment.payment_method,
    pending_payment.payment_terms,
    pending_payment.payment_date,
    (select auth.uid()),
    pending_payment.reference_number,
    pending_payment.notes
  )
  returning id into inserted_payment_id;

  update public.agent_received_payment
  set status = 'confirmed',
      confirmed_payment_id = inserted_payment_id,
      confirmed_by = (select auth.uid()),
      confirmed_at = now(),
      updated_at = now()
  where id = pending_payment.id;

  return inserted_payment_id;
end;
$$;
