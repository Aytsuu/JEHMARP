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
      agent_profile.display_name,
      agent_profile.status,
      auth_users.email,
      agent_profile.contact,
      agent_profile.created_at,
      agent_profile.updated_at,
      lower(concat_ws(
        ' ',
        agent_profile.display_name,
        auth_users.email,
        agent_profile.contact,
        agent_profile.status
      )) as search_text
    from public.agent_profile
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
    order by counted.display_name asc, counted.id asc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.display_name asc, paged.id asc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function "public"."list_admin_agent_rows"("text", "text", integer, integer) owner to "postgres";

revoke all on function "public"."list_admin_agent_rows"("text", "text", integer, integer) from public;
revoke all on function "public"."list_admin_agent_rows"("text", "text", integer, integer) from anon;
revoke all on function "public"."list_admin_agent_rows"("text", "text", integer, integer) from authenticated;
grant execute on function "public"."list_admin_agent_rows"("text", "text", integer, integer) to service_role;
