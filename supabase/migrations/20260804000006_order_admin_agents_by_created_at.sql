-- Admin agents table should show newest agents first, consistent with other admin lists.

create or replace function public.list_admin_agent_rows(
  search_query text default null,
  status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
)
returns table (
  records jsonb,
  total_rows bigint
)
language sql
stable
security definer
set search_path = ''
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
      agent_row.id,
      agent_row.user_id,
      agent_row.customer_id,
      agent_row.employee_id,
      agent_person.first_name,
      agent_person.last_name,
      agent_person.display_name,
      agent_row.status,
      coalesce(auth_users.email, agent_person.email) as email,
      agent_person.phone_number as contact,
      agent_row.created_at,
      agent_row.updated_at,
      lower(concat_ws(
        ' ',
        agent_row.id::text,
        agent_row.employee_id,
        agent_person.first_name,
        agent_person.last_name,
        agent_person.display_name,
        coalesce(auth_users.email, agent_person.email),
        agent_person.phone_number,
        agent_row.status
      )) as search_text
    from public.agent agent_row
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join auth.users auth_users
      on auth_users.id = agent_row.user_id
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

alter function public.list_admin_agent_rows(text, text, integer, integer) owner to postgres;
