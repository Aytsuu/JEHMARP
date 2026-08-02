alter table public.customer
  add column if not exists promoted_to_agent_id uuid,
  add column if not exists promoted_to_agent_at timestamp with time zone;

alter table public.customer
  drop constraint if exists customer_promoted_to_agent_id_fkey;

alter table public.customer
  add constraint customer_promoted_to_agent_id_fkey
  foreign key (promoted_to_agent_id)
  references public.agent(id)
  on delete set null;

create index if not exists customer_promoted_to_agent_id_idx
  on public.customer using btree (promoted_to_agent_id);

create index if not exists customer_active_created_at_idx
  on public.customer using btree (created_at desc)
  where promoted_to_agent_id is null;

comment on column public.customer.promoted_to_agent_id is
  'Agent record created when this customer role was promoted. Promoted customers are hidden from active customer management.';

comment on column public.customer.promoted_to_agent_at is
  'Timestamp when this customer role was promoted to an agent role.';

update public.customer
set promoted_to_agent_id = agent.id,
    promoted_to_agent_at = coalesce(agent.promoted_from_customer_at, public.customer.promoted_to_agent_at, now()),
    updated_at = now()
from public.agent
where agent.promoted_from_customer_id = public.customer.id
  and public.customer.promoted_to_agent_id is distinct from agent.id;

insert into public.customer (
  id,
  profile_id,
  assigned_agent_id,
  created_by,
  is_reseller,
  promoted_to_agent_id,
  promoted_to_agent_at,
  created_at,
  updated_at
)
select
  agent.promoted_from_customer_id,
  agent.profile_id,
  agent.id,
  agent.user_id,
  false,
  agent.id,
  coalesce(agent.promoted_from_customer_at, now()),
  coalesce(agent.promoted_from_customer_at, now()),
  now()
from public.agent
where agent.promoted_from_customer_id is not null
  and not exists (
    select 1
    from public.customer
    where customer.id = agent.promoted_from_customer_id
  );

update public.customer_order
set customer_id = agent.promoted_from_customer_id,
    updated_at = now()
from public.agent
where customer_order.customer_id is null
  and customer_order.agent_id = agent.id
  and agent.promoted_from_customer_id is not null;

do $$
begin
  if exists (
    select 1
    from public.customer_order
    where customer_id is null
  ) then
    raise exception 'Cannot restore customer_order.customer_id constraint while unlinked customer orders remain.';
  end if;
end $$;

alter table public.customer_order
  drop constraint if exists customer_order_customer_id_fkey;

alter table public.customer_order
  alter column customer_id set not null;

alter table public.customer_order
  add constraint customer_order_customer_id_fkey
  foreign key (customer_id)
  references public.customer(id)
  on delete restrict;

create or replace function public.list_admin_customer_rows(
  search_query text default null,
  customer_type_filter text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
  language sql stable
  security definer
  set search_path = ''
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
      customer_person.first_name,
      customer_person.last_name,
      customer_person.phone_number,
      customer_person.email,
      customer_person.address,
      customer.assigned_agent_id,
      customer.is_reseller,
      customer.credit_limit,
      customer.credit_limit_exceeded,
      private.compute_customer_credit_balance(customer.id) as outstanding_credit_balance,
      customer.created_at,
      customer.updated_at,
      assigned_agent_person.display_name as assigned_agent_name,
      lower(concat_ws(
        ' ',
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        assigned_agent_person.display_name
      )) as search_text
    from public.customer
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent assigned_agent
      on assigned_agent.id = customer.assigned_agent_id
    left join public.profile assigned_agent_person
      on assigned_agent_person.id = assigned_agent.profile_id
    where customer.promoted_to_agent_id is null
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
