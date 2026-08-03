-- Optional agent and exclude filters for attach-order customer pickers.
-- Drop the legacy 4-arg overload so PostgREST can resolve a single RPC signature.

drop function if exists public.list_admin_customer_rows(text, text, integer, integer);

create or replace function public.list_admin_customer_rows(
  search_query text default null,
  customer_type_filter text default null,
  page_number integer default 1,
  page_size integer default 10,
  assigned_agent_id_filter uuid default null,
  exclude_customer_ids uuid[] default null
) returns table(records jsonb, total_rows bigint)
  language sql stable
  security definer
  set search_path = ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(customer_type_filter, '') as customer_type_value,
      assigned_agent_id_filter as assigned_agent_id_value,
      exclude_customer_ids as exclude_customer_id_values,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      customer.id,
      customer.tracking_number,
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
        customer.tracking_number,
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
      and (
        normalized.assigned_agent_id_value is null
        or base_rows.assigned_agent_id = normalized.assigned_agent_id_value
      )
      and (
        normalized.exclude_customer_id_values is null
        or cardinality(normalized.exclude_customer_id_values) = 0
        or not (base_rows.id = any(normalized.exclude_customer_id_values))
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

alter function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[]) owner to postgres;

revoke all on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[]) from public;
revoke all on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[]) from anon;
revoke all on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[]) from authenticated;
grant execute on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[]) to service_role;
