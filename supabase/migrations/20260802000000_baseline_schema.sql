--
-- PostgreSQL database dump
--

-- \restrict dVWVf4O6ZDvFS7Jar7POu0ijvpU2wfJlnaqhOcgcGPGCXYXXqz9x8HWZEOSdfhx

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: agent_can_access_order("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    exists (
      select 1
      from public."order" order_row
      left join public.customer
        on customer.id = order_row.customer_id
      where order_row.id = target_order_id
        and order_row.order_kind in ('customer', 'personal')
        and (
          order_row.agent_id = (select private.current_agent_profile_id())
          or customer.assigned_agent_id = (select private.current_agent_profile_id())
        )
    )
    or exists (
      select 1
      from public."order" distribution_order
      where distribution_order.id = target_order_id
        and distribution_order.order_kind = 'distribution'
        and distribution_order.agent_id = (select private.current_agent_profile_id())
    )
    or exists (
      select 1
      from public."order" child_order
      join public."order" distribution_order
        on distribution_order.id = child_order.parent_order_id
      where child_order.id = target_order_id
        and child_order.order_kind in ('customer', 'personal')
        and distribution_order.order_kind = 'distribution'
        and distribution_order.agent_id = (select private.current_agent_profile_id())
    ),
    false
  );
$$;


ALTER FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: agent_order_approved_distributed_quantity("uuid", "uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."agent_order_approved_distributed_quantity"("target_agent_order_id" "uuid", "target_product_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(sum(order_item.partial_quantity), 0)
  from public."order" child_order
  join public.order_item
    on order_item.order_id = child_order.id
    and order_item.order_kind in ('customer', 'personal')
  where child_order.parent_order_id = target_agent_order_id
    and child_order.order_kind in ('customer', 'personal')
    and child_order.order_status <> 'pending'
    and order_item.product_id = target_product_id;
$$;


ALTER FUNCTION "private"."agent_order_approved_distributed_quantity"("target_agent_order_id" "uuid", "target_product_id" "uuid") OWNER TO "postgres";

--
-- Name: agent_order_item_is_fully_paid("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."agent_order_item_is_fully_paid"("target_agent_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public."order" child_order
    where child_order.parent_order_id = target_agent_order_id
      and child_order.order_kind in ('customer', 'personal')
  )
  and not exists (
    select 1
    from public."order" child_order
    where child_order.parent_order_id = target_agent_order_id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.payment_status <> 'paid'
  );
$$;


ALTER FUNCTION "private"."agent_order_item_is_fully_paid"("target_agent_order_id" "uuid") OWNER TO "postgres";

--
-- Name: apply_agent_order_customer_approval_on_status_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."apply_agent_order_customer_approval_on_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE'
     and old.order_status = 'pending'
     and new.order_status = 'processing'
     and new.parent_order_id is not null then
    perform public.apply_agent_order_customer_approval(new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."apply_agent_order_customer_approval_on_status_change"() OWNER TO "postgres";

--
-- Name: apply_agent_order_item_quantity_increase("uuid", "uuid", numeric, "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."apply_agent_order_item_quantity_increase"("target_agent_order_id" "uuid", "target_product_id" "uuid", "quantity_increase" numeric, "item_details" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  existing_item_id uuid;
begin
  if quantity_increase is null or quantity_increase <= 0 then
    return;
  end if;

  select id
  into existing_item_id
  from public.order_item
  where order_id = target_agent_order_id
    and product_id = target_product_id
    and order_kind = 'distribution'
  limit 1;

  if existing_item_id is null then
    insert into public.order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      order_kind,
      agent_commission_amount
    )
    values (
      target_agent_order_id,
      target_product_id,
      quantity_increase,
      quantity_increase,
      item_details,
      'distribution',
      coalesce(private.calculate_product_agent_commission(target_product_id, quantity_increase, null), 0)
    );
    return;
  end if;

  update public.order_item
  set partial_quantity = partial_quantity + quantity_increase,
      final_quantity = final_quantity + quantity_increase,
      updated_at = now()
  where id = existing_item_id;
end;
$$;


ALTER FUNCTION "private"."apply_agent_order_item_quantity_increase"("target_agent_order_id" "uuid", "target_product_id" "uuid", "quantity_increase" numeric, "item_details" "text") OWNER TO "postgres";

--
-- Name: block_payment_mutation(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."block_payment_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  raise exception 'Payment records are append-only. Create a new compensating workflow record instead of updating or deleting an existing payment.';
end;
$$;


ALTER FUNCTION "private"."block_payment_mutation"() OWNER TO "postgres";

--
-- Name: block_pending_agent_order_customer_link(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."block_pending_agent_order_customer_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.parent_order_id is not null
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = new.parent_order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.order_status = 'pending_order'
    ) then
    raise exception 'Agent order must be approved before customer orders can be attached.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."block_pending_agent_order_customer_link"() OWNER TO "postgres";

--
-- Name: block_referenced_product_delete(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."block_referenced_product_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if exists (
    select 1
    from public.order_item
    where product_id = old.id
  ) then
    raise exception 'Products referenced by order items cannot be deleted. Deactivate the product instead.';
  end if;

  return old;
end;
$$;


ALTER FUNCTION "private"."block_referenced_product_delete"() OWNER TO "postgres";

--
-- Name: calculate_product_agent_commission("uuid", numeric, numeric); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(
    coalesce(
      case product.agent_commission_type
        when 'percentage' then coalesce(target_unit_price, product.default_price, 0) * coalesce(target_quantity, 0) * product.agent_commission_value / 100
        else coalesce(target_quantity, 0) * product.agent_commission_value
      end,
      0
    ),
    2
  )
  from public.product
  where product.id = target_product_id
$$;


ALTER FUNCTION "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) OWNER TO "postgres";

--
-- Name: close_paid_customer_order("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."close_paid_customer_order"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public."order"
  set order_status = 'closed',
      sale_date = coalesce(sale_date, now()),
      updated_at = now()
  where id = target_order_id
    and order_kind in ('customer', 'personal')
    and payment_status = 'paid'
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public.invoice
      where invoice.order_id = target_order_id
    );
end;
$$;


ALTER FUNCTION "private"."close_paid_customer_order"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: close_paid_customer_order_after_payment_status_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."close_paid_customer_order_after_payment_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.order_kind in ('customer', 'personal')
    and new.payment_status = 'paid'
    and old.payment_status is distinct from new.payment_status then
    perform private.close_paid_customer_order(new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."close_paid_customer_order_after_payment_status_change"() OWNER TO "postgres";

--
-- Name: compute_customer_credit_balance("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."compute_customer_credit_balance"("target_customer_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select round(coalesce(sum(public.compute_payment_balance(order_row.id)), 0), 2)
  from public."order" order_row
  where order_row.customer_id = target_customer_id
    and order_row.order_kind in ('customer', 'personal')
    and order_row.order_status <> 'closed'
    and order_row.payment_status in ('unpaid', 'partial')
    and order_row.converted_at is null;
$$;


ALTER FUNCTION "private"."compute_customer_credit_balance"("target_customer_id" "uuid") OWNER TO "postgres";

--
-- Name: create_customer_with_profile("text", "text", "text", "text", "text", "uuid", boolean, "uuid", "uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."create_customer_with_profile"("p_first_name" "text", "p_last_name" "text", "p_phone_number" "text", "p_email" "text" DEFAULT NULL::"text", "p_address" "text" DEFAULT NULL::"text", "p_assigned_agent_id" "uuid" DEFAULT NULL::"uuid", "p_is_reseller" boolean DEFAULT false, "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_profile_id uuid := p_profile_id;
  v_customer_id uuid;
begin
  if v_profile_id is null then
    insert into public.profile (
      first_name,
      last_name,
      display_name,
      email,
      phone_number,
      address
    )
    values (
      p_first_name,
      p_last_name,
      trim(concat_ws(' ', p_first_name, p_last_name)),
      nullif(trim(coalesce(p_email, '')), ''),
      p_phone_number,
      p_address
    )
    returning id into v_profile_id;
  end if;

  insert into public.customer (
    profile_id,
    assigned_agent_id,
    is_reseller,
    created_by
  )
  values (
    v_profile_id,
    p_assigned_agent_id,
    coalesce(p_is_reseller, false),
    p_created_by
  )
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;


ALTER FUNCTION "private"."create_customer_with_profile"("p_first_name" "text", "p_last_name" "text", "p_phone_number" "text", "p_email" "text", "p_address" "text", "p_assigned_agent_id" "uuid", "p_is_reseller" boolean, "p_created_by" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";

--
-- Name: current_agent_profile_id(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."current_agent_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id
  from public.agent
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;


ALTER FUNCTION "private"."current_agent_profile_id"() OWNER TO "postgres";

--
-- Name: derive_invoice_status("uuid", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with invoice_row as (
    select invoice.status
    from public.invoice
    where invoice.order_id = target_order_id
    limit 1
  ),
  totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_payment_balance(target_order_id), 0) as payment_balance
    from invoice_row
  )
  select case
    when current_status = 'void' then 'void'
    when invoice_total <= 0 then 'paid'
    when payment_balance <= 0 then 'paid'
    when payment_total > 0 then 'partially_paid'
    when current_status = 'draft' then 'draft'
    else 'issued'
  end
  from totals;
$$;


ALTER FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") OWNER TO "postgres";

--
-- Name: derive_payment_status("uuid", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_payment_balance(target_order_id), 0) as payment_balance
  )
  select case
    when current_status in ('refunded', 'void') then current_status
    when invoice_total <= 0 then 'paid'
    when payment_balance <= 0 then 'paid'
    when payment_total <= 0 then 'unpaid'
    else 'partial'
  end
  from totals;
$$;


ALTER FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") OWNER TO "postgres";

--
-- Name: generate_customer_tracking_number(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."generate_customer_tracking_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := 'JHM-';

    for char_index in 1..8 loop
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::integer,
        1
      );
    end loop;

    if not exists (
      select 1
      from public.customer
      where tracking_number = candidate
    ) then
      return candidate;
    end if;

    attempt := attempt + 1;

    if attempt > 50 then
      raise exception 'Unable to generate unique customer tracking number.';
    end if;
  end loop;

  return null;
end;
$$;


ALTER FUNCTION "private"."generate_customer_tracking_number"() OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";

--
-- Name: is_agent(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."is_agent"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select private.current_agent_profile_id()) is not null;
$$;


ALTER FUNCTION "private"."is_agent"() OWNER TO "postgres";

--
-- Name: is_valid_customer_order_status_transition("text", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."is_valid_customer_order_status_transition"("from_status" "text", "to_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when from_status is null then to_status in ('pending', 'processing', 'closed')
    when from_status = to_status then true
    when from_status = 'pending' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed')
    when from_status = 'closed' then false
    else false
  end;
$$;


ALTER FUNCTION "private"."is_valid_customer_order_status_transition"("from_status" "text", "to_status" "text") OWNER TO "postgres";

--
-- Name: is_valid_distribution_order_status_transition("text", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."is_valid_distribution_order_status_transition"("from_status" "text", "to_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when from_status is null then to_status in ('pending_customers', 'pending_order', 'processing', 'closed')
    when from_status = to_status then true
    when from_status = 'pending_customers' then to_status in ('pending_order', 'processing', 'closed')
    when from_status = 'pending_order' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed')
    when from_status = 'closed' then false
    else false
  end;
$$;


ALTER FUNCTION "private"."is_valid_distribution_order_status_transition"("from_status" "text", "to_status" "text") OWNER TO "postgres";

--
-- Name: is_valid_invoice_status_transition("text", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."is_valid_invoice_status_transition"("from_status" "text", "to_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when from_status is null then to_status in ('draft', 'issued', 'partially_paid', 'paid')
    when from_status = to_status then true
    when from_status = 'draft' then to_status in ('issued', 'partially_paid', 'paid')
    when from_status = 'issued' then to_status in ('partially_paid', 'paid')
    when from_status = 'partially_paid' then to_status in ('issued', 'paid')
    when from_status = 'paid' then to_status in ('partially_paid')
    else false
  end;
$$;


ALTER FUNCTION "private"."is_valid_invoice_status_transition"("from_status" "text", "to_status" "text") OWNER TO "postgres";

--
-- Name: is_valid_order_status_transition("text", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select private.is_valid_customer_order_status_transition(from_status, to_status)
     or private.is_valid_distribution_order_status_transition(from_status, to_status);
$$;


ALTER FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") OWNER TO "postgres";

--
-- Name: parse_schedule_timestamp("text", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."parse_schedule_timestamp"("schedule_date" "text", "schedule_time" "text" DEFAULT NULL::"text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  normalized_date text := nullif(trim(schedule_date), '');
  normalized_time text := coalesce(nullif(trim(schedule_time), ''), '00:00');
begin
  if normalized_date is null then
    return null;
  end if;

  if position('T' in normalized_date) > 0 then
    return normalized_date::timestamptz;
  end if;

  return (normalized_date || 'T' || normalized_time || ':00')::timestamp at time zone 'Asia/Manila';
end;
$$;


ALTER FUNCTION "private"."parse_schedule_timestamp"("schedule_date" "text", "schedule_time" "text") OWNER TO "postgres";

--
-- Name: record_invoice_status_update(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."record_invoice_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "private"."record_invoice_status_update"() OWNER TO "postgres";

--
-- Name: record_order_status_history(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."record_order_status_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  previous_status text;
begin
  if tg_op = 'INSERT' then
    previous_status := null;
  elsif old.order_status is not distinct from new.order_status then
    return new;
  else
    previous_status := old.order_status;
  end if;

  insert into public.order_status_history (
    order_id,
    from_status,
    to_status,
    changed_by,
    notes
  )
  values (
    new.id,
    previous_status,
    new.order_status,
    auth.uid(),
    case
      when previous_status is null then 'Order created with status ' || new.order_status || '.'
      else 'Order status changed from ' || previous_status || ' to ' || new.order_status || '.'
    end
  );

  return new;
end;
$$;


ALTER FUNCTION "private"."record_order_status_history"() OWNER TO "postgres";

--
-- Name: record_payment_insert(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."record_payment_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.refresh_order_financial_status(new.order_id);
  return new;
end;
$$;


ALTER FUNCTION "private"."record_payment_insert"() OWNER TO "postgres";

--
-- Name: refresh_agent_order_after_customer_order_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_agent_order_after_customer_order_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op in ('UPDATE', 'DELETE')
    and old.parent_order_id is not null
    and old.converted_at is null then
    perform private.refresh_agent_order_status(old.parent_order_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.parent_order_id is not null
    and new.converted_at is null then
    perform private.refresh_agent_order_status(new.parent_order_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_agent_order_after_customer_order_change"() OWNER TO "postgres";

--
-- Name: refresh_agent_order_status("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public."order"
  set order_status = 'processing',
      sale_date = null,
      updated_at = now()
  where id = target_agent_order_id
    and order_kind = 'distribution'
    and order_status = 'pending_customers'
    and exists (
      select 1
      from public."order" child_order
      where child_order.parent_order_id = target_agent_order_id
        and child_order.order_kind in ('customer', 'personal')
    );

  update public."order"
  set order_status = 'closed',
      sale_date = coalesce(sale_date, now()),
      updated_at = now()
  where id = target_agent_order_id
    and order_kind = 'distribution'
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public."order" child_order
      where child_order.parent_order_id = target_agent_order_id
        and child_order.order_kind in ('customer', 'personal')
    )
    and not exists (
      select 1
      from public."order" child_order
      where child_order.parent_order_id = target_agent_order_id
        and child_order.order_kind in ('customer', 'personal')
        and child_order.payment_status is distinct from 'paid'
    );
end;
$$;


ALTER FUNCTION "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") OWNER TO "postgres";

--
-- Name: refresh_customer_credit_after_limit_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_customer_credit_after_limit_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.refresh_customer_credit_limit_status(new.id);
  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_customer_credit_after_limit_change"() OWNER TO "postgres";

--
-- Name: refresh_customer_credit_after_order_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_customer_credit_after_order_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_customer_credit_limit_status(old.customer_id);
    return old;
  end if;

  perform private.refresh_customer_credit_limit_status(new.customer_id);

  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform private.refresh_customer_credit_limit_status(old.customer_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_customer_credit_after_order_change"() OWNER TO "postgres";

--
-- Name: refresh_customer_credit_after_order_item_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_customer_credit_after_order_item_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_order_id uuid;
  target_customer_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select order_row.customer_id
  into target_customer_id
  from public."order" order_row
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal');

  perform private.refresh_customer_credit_limit_status(target_customer_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_customer_credit_after_order_item_change"() OWNER TO "postgres";

--
-- Name: refresh_customer_credit_after_payment_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_customer_credit_after_payment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_order_id uuid;
  target_customer_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select order_row.customer_id
  into target_customer_id
  from public."order" order_row
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal');

  perform private.refresh_customer_credit_limit_status(target_customer_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_customer_credit_after_payment_change"() OWNER TO "postgres";

--
-- Name: refresh_customer_credit_limit_status("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_customer_credit_limit_status"("target_customer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_balance numeric;
begin
  if target_customer_id is null then
    return;
  end if;

  select private.compute_customer_credit_balance(target_customer_id)
  into current_balance;

  update public.customer
  set
    credit_limit_exceeded = coalesce(current_balance, 0) > 0
      and coalesce(current_balance, 0) >= credit_limit,
    updated_at = now()
  where id = target_customer_id
    and credit_limit_exceeded is distinct from (
      coalesce(current_balance, 0) > 0
      and coalesce(current_balance, 0) >= credit_limit
    );
end;
$$;


ALTER FUNCTION "private"."refresh_customer_credit_limit_status"("target_customer_id" "uuid") OWNER TO "postgres";

--
-- Name: refresh_order_after_invoice_insert(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_order_after_invoice_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.refresh_order_financial_status(new.order_id);
  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_order_after_invoice_insert"() OWNER TO "postgres";

--
-- Name: refresh_order_after_item_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_order_after_item_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_order_financial_status(new.order_id);
    return new;
  end if;

  perform private.refresh_order_financial_status(old.order_id);
  return old;
end;
$$;


ALTER FUNCTION "private"."refresh_order_after_item_change"() OWNER TO "postgres";

--
-- Name: refresh_order_after_order_status_change(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_order_after_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.order_status is distinct from new.order_status then
    perform private.refresh_order_financial_status(new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."refresh_order_after_order_status_change"() OWNER TO "postgres";

--
-- Name: refresh_order_financial_status("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  next_payment_status text;
  next_invoice_status text;
  current_invoice_status text;
begin
  select private.derive_payment_status(target_order_id, order_row.payment_status)
  into next_payment_status
  from public."order" order_row
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal');

  if next_payment_status is not null then
    update public."order"
    set payment_status = next_payment_status,
        updated_at = now()
    where id = target_order_id
      and order_kind in ('customer', 'personal')
      and payment_status is distinct from next_payment_status;
  end if;

  perform private.close_paid_customer_order(target_order_id);

  select invoice.status
  into current_invoice_status
  from public.invoice
  where invoice.order_id = target_order_id
  limit 1;

  if current_invoice_status is not null then
    next_invoice_status := private.derive_invoice_status(target_order_id, current_invoice_status);

    update public.invoice
    set status = next_invoice_status,
        updated_at = now()
    where order_id = target_order_id
      and status is distinct from next_invoice_status;
  end if;
end;
$$;


ALTER FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: set_customer_tracking_number(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."set_customer_tracking_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.tracking_number is null then
    new.tracking_number := private.generate_customer_tracking_number();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."set_customer_tracking_number"() OWNER TO "postgres";

--
-- Name: sync_agent_order_item_commission(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."sync_agent_order_item_commission"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.order_kind <> 'distribution' then
    return new;
  end if;

  new.agent_commission_amount := coalesce(
    private.calculate_product_agent_commission(new.product_id, new.partial_quantity, null),
    0
  );

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_agent_order_item_commission"() OWNER TO "postgres";

--
-- Name: sync_agent_order_status_from_customer_link(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."sync_agent_order_status_from_customer_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.parent_order_id is not null
    and new.converted_at is null then
    update public."order"
    set order_status = 'pending_order',
        updated_at = now()
    where id = new.parent_order_id
      and order_kind = 'distribution'
      and order_status = 'pending_customers';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_agent_order_status_from_customer_link"() OWNER TO "postgres";

--
-- Name: sync_order_item_final_quantity(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."sync_order_item_final_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'INSERT'
     or new.partial_quantity is distinct from old.partial_quantity then
    new.final_quantity := new.partial_quantity;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_order_item_final_quantity"() OWNER TO "postgres";

--
-- Name: sync_order_item_price_snapshot(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."sync_order_item_price_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  order_customer_is_reseller boolean;
  retail_price numeric;
  reseller_price_value numeric;
begin
  if new.order_kind = 'distribution' then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select customer.is_reseller
    into order_customer_is_reseller
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    where order_row.id = new.order_id
      and order_row.order_kind in ('customer', 'personal');

    if order_customer_is_reseller is null then
      raise exception 'Order % does not have a valid customer for pricing.', new.order_id;
    end if;

    select product.default_price, product.reseller_price
    into retail_price, reseller_price_value
    from public.product
    where product.id = new.product_id;

    if retail_price is null or reseller_price_value is null then
      raise exception 'Product % does not have valid prices for order item pricing.', new.product_id;
    end if;

    if order_customer_is_reseller then
      new.unit_price := reseller_price_value;
      new.price_type := 'reseller';
    else
      new.unit_price := retail_price;
      new.price_type := 'retail';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_order_item_price_snapshot"() OWNER TO "postgres";

--
-- Name: sync_order_sale_date(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."sync_order_sale_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.order_kind = 'distribution' then
    if new.order_status = 'closed' then
      new.sale_date := coalesce(new.sale_date, now());
    else
      new.sale_date := null;
    end if;
  elsif new.order_kind in ('customer', 'personal') then
    if new.order_status = 'closed' and new.payment_status = 'paid' then
      new.sale_date := coalesce(new.sale_date, now());
    else
      new.sale_date := null;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_order_sale_date"() OWNER TO "postgres";

--
-- Name: validate_invoice_status_transition(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."validate_invoice_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.status is distinct from new.status
     and not private.is_valid_invoice_status_transition(old.status, new.status) then
    raise exception 'Invalid invoice status transition from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."validate_invoice_status_transition"() OWNER TO "postgres";

--
-- Name: validate_order_status_transition(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."validate_order_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.order_status is distinct from new.order_status then
    if new.order_kind = 'distribution' then
      if not private.is_valid_distribution_order_status_transition(old.order_status, new.order_status) then
        raise exception 'Invalid distribution order status transition from % to %.', old.order_status, new.order_status;
      end if;
    elsif not private.is_valid_customer_order_status_transition(old.order_status, new.order_status) then
      raise exception 'Invalid order status transition from % to %.', old.order_status, new.order_status;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."validate_order_status_transition"() OWNER TO "postgres";

--
-- Name: apply_agent_order_customer_approval("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_order record;
  item record;
begin
  select
    parent_order.id,
    parent_order.parent_order_id,
    parent_order.order_status
  into current_order
  from public."order" parent_order
  where parent_order.id = target_customer_order_id
    and parent_order.order_kind in ('customer', 'personal')
  limit 1;

  if current_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if current_order.parent_order_id is null then
    return current_order.id;
  end if;

  if current_order.order_status <> 'processing' then
    return current_order.id;
  end if;

  for item in
    select
      order_item.product_id,
      order_item.agent_order_quantity_increase,
      order_item.add_details
    from public.order_item
    where order_item.order_id = current_order.id
      and order_item.order_kind in ('customer', 'personal')
      and order_item.agent_order_quantity_increase > 0
  loop
    perform private.apply_agent_order_item_quantity_increase(
      current_order.parent_order_id,
      item.product_id,
      item.agent_order_quantity_increase,
      item.add_details
    );
  end loop;

  update public.order_item
  set agent_order_quantity_increase = 0
  where order_id = current_order.id
    and order_kind in ('customer', 'personal')
    and agent_order_quantity_increase > 0;

  return current_order.id;
end;
$$;


ALTER FUNCTION "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") OWNER TO "postgres";

--
-- Name: apply_customer_payment_distribution("uuid", numeric, "text", "text", timestamp with time zone, "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_customer_payment_distribution"("target_customer_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "recorded_by_value" "uuid", "reference_number_value" "text" DEFAULT NULL::"text", "notes_value" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  remaining_amount numeric;
  total_balance numeric;
  order_row record;
  applied_amount numeric;
  distributions jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to distribute payment.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can distribute customer payments.';
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

  select coalesce(sum(public.compute_payment_balance(customer_order.id)), 0)
  into total_balance
  from public."order" customer_order
  where customer_order.order_kind in ('customer', 'personal')
    and customer_order.customer_id = target_customer_id
    and customer_order.order_status <> 'closed'
    and customer_order.payment_status in ('unpaid', 'partial');

  remaining_amount := round(payment_amount, 2);
  total_balance := round(total_balance, 2);

  if remaining_amount > total_balance then
    raise exception 'Payment amount exceeds the customer pending balance of %.', total_balance;
  end if;

  for order_row in
    select
      customer_order.id,
      public.compute_payment_balance(customer_order.id) as balance
    from public."order" customer_order
    where customer_order.order_kind in ('customer', 'personal')
      and customer_order.customer_id = target_customer_id
      and customer_order.order_status <> 'closed'
      and customer_order.payment_status in ('unpaid', 'partial')
    order by customer_order.created_at asc, customer_order.id asc
    for update of customer_order
  loop
    exit when remaining_amount <= 0;
    continue when order_row.balance <= 0;

    applied_amount := least(remaining_amount, round(order_row.balance, 2));

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
      order_row.id,
      applied_amount,
      payment_method_value,
      payment_terms_value,
      payment_date_value,
      recorded_by_value,
      nullif(reference_number_value, ''),
      nullif(notes_value, '')
    );

    distributions := distributions || jsonb_build_object(
      'order_id', order_row.id,
      'amount', applied_amount
    );

    remaining_amount := round(remaining_amount - applied_amount, 2);
  end loop;

  return jsonb_build_object(
    'applied_total', payment_amount,
    'distributions', distributions
  );
end;
$$;


ALTER FUNCTION "public"."apply_customer_payment_distribution"("target_customer_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "recorded_by_value" "uuid", "reference_number_value" "text", "notes_value" "text") OWNER TO "postgres";

--
-- Name: assign_invoice_number_from_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assign_invoice_number_from_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  prefix text;
  sequence_value bigint;
begin
  select coalesce(settings #>> '{documentNumbering,invoicePrefix}', 'INV-')
  into prefix
  from public.platform_settings
  where id = 'default';

  sequence_value := nextval('public.invoice_number_seq');
  new.invoice_number := prefix || lpad(sequence_value::text, 8, '0');
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_invoice_number_from_settings"() OWNER TO "postgres";

--
-- Name: attach_customer_to_agent_order("uuid", "uuid", "jsonb", "jsonb", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb" DEFAULT NULL::"jsonb", "require_approval" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  from public."order"
  where id = target_agent_order_id
    and order_kind = 'distribution'
  limit 1;

  if agent_order_agent_id is null then
    raise exception 'Agent order was not found.';
  end if;

  if agent_order_status = 'closed'
     and exists (
       select 1
       from public."order" child_order
       where child_order.parent_order_id = target_agent_order_id
         and child_order.order_kind in ('customer', 'personal')
     )
     and not exists (
       select 1
       from public."order" child_order
       where child_order.parent_order_id = target_agent_order_id
         and child_order.order_kind in ('customer', 'personal')
         and child_order.payment_status is distinct from 'paid'
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
    from public.agent
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

    resolved_customer_id := private.create_customer_with_profile(
      trim(customer_payload ->> 'firstName'),
      trim(customer_payload ->> 'lastName'),
      trim(customer_payload ->> 'phoneNumber'),
      nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
      trim(customer_payload ->> 'address'),
      current_agent_id,
      false,
      (select auth.uid())
    );
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

  insert into public."order" (
    customer_id,
    agent_id,
    parent_order_id,
    source,
    order_status,
    payment_status,
    release_date,
    submitted_by,
    approved_by,
    approved_at,
    order_kind
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
    private.parse_schedule_timestamp(coalesce(customer_payload ->> 'releaseDate', ''), customer_payload ->> 'releaseTime'),
    (select auth.uid()),
    case
      when require_approval then null
      else (select auth.uid())
    end,
    case
      when require_approval then null
      else now()
    end,
    'customer'
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

    select partial_quantity
    into existing_item_quantity
    from public.order_item
    where order_id = target_agent_order_id
      and product_id = item_product_id
      and order_kind = 'distribution'
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
      insert into public.order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details,
        order_kind,
        agent_commission_amount
      )
      values (
        target_agent_order_id,
        item_product_id,
        0,
        0,
        item_details,
        'distribution',
        0
      );
    end if;

    insert into public.order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      agent_order_quantity_increase,
      order_kind,
      unit_price,
      price_type,
      agent_commission_amount
    )
    select
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
      end,
      'customer',
      case
        when customer_row.is_reseller then product_row.reseller_price
        else product_row.default_price
      end,
      case
        when customer_row.is_reseller then 'reseller'::text
        else 'retail'::text
      end,
      round(
        coalesce(
          case product_row.agent_commission_type
            when 'percentage' then
              coalesce(
                case
                  when customer_row.is_reseller then product_row.reseller_price
                  else product_row.default_price
                end,
                0
              ) * product_row.agent_commission_value / 100
            else product_row.agent_commission_value
          end,
          0
        ) * item_quantity,
        2
      )
    from public.product product_row
    cross join public.customer customer_row
    where product_row.id = item_product_id
      and customer_row.id = resolved_customer_id
      and product_row.default_price is not null
      and product_row.reseller_price is not null;

    if not found then
      raise exception 'Product % does not have valid prices for order item pricing.', item_product_id;
    end if;
  end loop;

  if not exists (
    select 1
    from public.order_item
    where order_id = inserted_order_id
      and order_kind in ('customer', 'personal')
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


ALTER FUNCTION "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) OWNER TO "postgres";

--
-- Name: compute_customer_amount_due("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_customer_amount_due"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(
    greatest(
      coalesce(public.compute_invoice_total(target_order_id), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    ),
    2
  );
$$;


ALTER FUNCTION "public"."compute_customer_amount_due"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_earned_commission("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_expected_commission(target_order_id), 0) as expected_commission
  ),
  receivable as (
    select
      invoice_total,
      payment_total,
      expected_commission,
      greatest(invoice_total - expected_commission, 0) as receivable_total
    from totals
  )
  select case
    when expected_commission <= 0 then 0
    when receivable_total <= 0 then round(expected_commission, 2)
    else round(expected_commission * least(payment_total / receivable_total, 1), 2)
  end
  from receivable;
$$;


ALTER FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_expected_commission("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with order_context as (
    select coalesce(
      order_row.agent_id is not null
      or order_row.parent_order_id is not null
      or order_row.converted_at is not null,
      false
    ) as commission_effective
    from public."order" order_row
    where order_row.id = target_order_id
      and order_row.order_kind in ('customer', 'personal')
  )
  select round(
    coalesce(
      sum(
        case
          when not coalesce((select commission_effective from order_context), false) then
            0
          when coalesce(order_item.agent_commission_amount, 0) > 0 then
            order_item.agent_commission_amount
          else
            coalesce(
              private.calculate_product_agent_commission(
                order_item.product_id,
                order_item.final_quantity,
                order_item.unit_price
              ),
              0
            )
        end
      ),
      0
    ),
    2
  )
  from public.order_item
  where order_item.order_id = target_order_id
    and order_item.order_kind in ('customer', 'personal');
$$;


ALTER FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_invoice_total("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(
    coalesce(sum(order_item.final_quantity * order_item.unit_price), 0),
    2
  )
  from public."order" order_row
  left join public.order_item
    on order_item.order_id = order_row.id
    and order_item.order_kind in ('customer', 'personal')
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal')
  group by order_row.id;
$$;


ALTER FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_order_total("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_order_total"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(
    coalesce(sum(order_item.partial_quantity * order_item.unit_price), 0),
    2
  )
  from public."order" order_row
  left join public.order_item
    on order_item.order_id = order_row.id
    and order_item.order_kind in ('customer', 'personal')
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal')
  group by order_row.id;
$$;


ALTER FUNCTION "public"."compute_order_total"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_payment_balance("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with order_context as (
    select coalesce(
      order_row.agent_id is not null
      or order_row.parent_order_id is not null
      or order_row.converted_at is not null,
      false
    ) as deduct_commission
    from public."order" order_row
    where order_row.id = target_order_id
      and order_row.order_kind in ('customer', 'personal')
  ),
  commission_total as (
    select round(
      coalesce(
        sum(
          case
            when not coalesce((select deduct_commission from order_context), false) then
              0
            when coalesce(order_item.agent_commission_amount, 0) > 0 then
              order_item.agent_commission_amount
            when product.agent_commission_type = 'percentage' then
              coalesce(order_item.unit_price, product.default_price, 0)
              * coalesce(order_item.final_quantity, 0)
              * coalesce(product.agent_commission_value, 0)
              / 100
            else
              coalesce(order_item.final_quantity, 0)
              * coalesce(product.agent_commission_value, 0)
          end
        ),
        0
      ),
      2
    ) as amount
    from public.order_item
    left join public.product
      on product.id = order_item.product_id
    where order_item.order_id = target_order_id
      and order_item.order_kind in ('customer', 'personal')
  )
  select round(
    greatest(
      coalesce(public.compute_invoice_total(target_order_id), 0)
      - coalesce((select amount from commission_total), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    ),
    2
  );
$$;


ALTER FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_payment_total("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(coalesce(sum(payment.amount), 0), 2)
  from public.payment
  where payment.order_id = target_order_id;
$$;


ALTER FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: confirm_agent_received_payment("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."confirm_agent_received_payment"("agent_payment_id" "uuid", "recorded_by_value" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    coalesce(recorded_by_value, (select auth.uid())),
    pending_payment.reference_number,
    pending_payment.notes
  )
  returning id into inserted_payment_id;

  update public.agent_received_payment
  set status = 'confirmed',
      confirmed_payment_id = inserted_payment_id,
      confirmed_by = coalesce(recorded_by_value, (select auth.uid())),
      confirmed_at = now(),
      updated_at = now()
  where id = pending_payment.id;

  return inserted_payment_id;
end;
$$;


ALTER FUNCTION "public"."confirm_agent_received_payment"("agent_payment_id" "uuid", "recorded_by_value" "uuid") OWNER TO "postgres";

--
-- Name: convert_customer_order_to_agent_distribution_order("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  source_order public."order"%rowtype;
  source_customer public.customer%rowtype;
  target_agent_id uuid;
  inserted_agent_order_id uuid;
  item_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to convert customer orders.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can convert customer orders.';
  end if;

  select *
  into source_order
  from public."order"
  where id = target_order_id
    and order_kind in ('customer', 'personal')
  for update;

  if source_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if source_order.converted_at is not null then
    raise exception 'Customer order was already converted to an agent distribution order.';
  end if;

  if source_order.parent_order_id is not null then
    raise exception 'Customer order is already linked to an agent distribution order.';
  end if;

  if source_order.order_status = 'closed' then
    raise exception 'Closed customer orders cannot be converted.';
  end if;

  if source_order.payment_status <> 'unpaid' then
    raise exception 'Only unpaid customer orders can be converted.';
  end if;

  if exists (
    select 1
    from public.payment
    where payment.order_id = source_order.id
  ) then
    raise exception 'Customer orders with payment records cannot be converted.';
  end if;

  if exists (
    select 1
    from public.agent_received_payment
    where agent_received_payment.order_id = source_order.id
  ) then
    raise exception 'Customer orders with agent payment records cannot be converted.';
  end if;

  select *
  into source_customer
  from public.customer
  where id = source_order.customer_id;

  if source_customer.id is null then
    raise exception 'Customer order does not have a valid customer.';
  end if;

  target_agent_id := source_customer.promoted_to_agent_id;

  if target_agent_id is null then
    select agent.id
    into target_agent_id
    from public.agent
    where agent.promoted_from_customer_id = source_customer.id
    order by agent.promoted_from_customer_at desc nulls last, agent.created_at desc
    limit 1;
  end if;

  if target_agent_id is null then
    raise exception 'Customer order does not belong to a promoted customer.';
  end if;

  if not exists (
    select 1
    from public.agent
    where agent.id = target_agent_id
  ) then
    raise exception 'Promoted agent record was not found.';
  end if;

  select count(*)
  into item_count
  from public.order_item
  where order_id = source_order.id
    and order_kind in ('customer', 'personal');

  if item_count = 0 then
    raise exception 'Customer order has no items to convert.';
  end if;

  insert into public."order" (
    agent_id,
    order_status,
    notes,
    submitted_by,
    admin_read_at,
    admin_read_by,
    created_at,
    updated_at,
    order_kind,
    customer_id,
    source,
    payment_status,
    release_date
  )
  values (
    target_agent_id,
    'pending_customers',
    nullif(
      concat_ws(
        E'\n\n',
        source_order.notes,
        'Converted from customer order ' || source_order.id::text
      ),
      ''
    ),
    coalesce(source_order.submitted_by, (select auth.uid())),
    now(),
    (select auth.uid()),
    now(),
    now(),
    'distribution',
    null,
    'agent_submitted',
    'unpaid',
    source_order.release_date
  )
  returning id into inserted_agent_order_id;

  insert into public.order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    add_details,
    agent_commission_amount,
    created_at,
    updated_at,
    order_kind
  )
  select
    inserted_agent_order_id,
    source_item.product_id,
    source_item.partial_quantity,
    source_item.partial_quantity,
    source_item.add_details,
    source_item.agent_commission_amount,
    now(),
    now(),
    'distribution'
  from public.order_item source_item
  where source_item.order_id = source_order.id
    and source_item.order_kind in ('customer', 'personal');

  update public."order"
  set parent_order_id = inserted_agent_order_id,
      converted_at = now(),
      converted_by = (select auth.uid()),
      admin_read_at = coalesce(admin_read_at, now()),
      admin_read_by = coalesce(admin_read_by, (select auth.uid())),
      updated_at = now()
  where id = source_order.id;

  return inserted_agent_order_id;
end;
$$;


ALTER FUNCTION "public"."convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid") IS 'Admin-only conversion of an eligible promoted customer order into a new agent distribution order. Invoice-only orders are allowed; orders with payment records are blocked.';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "unit_label" "text" NOT NULL,
    "default_price" numeric(12,2) NOT NULL,
    "reseller_price" numeric(12,2) NOT NULL,
    "stock_status" "text" DEFAULT 'in_stock'::"text" NOT NULL,
    "image_path" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reseller_deduction_type" "text" DEFAULT 'value'::"text" NOT NULL,
    "reseller_deduction_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "agent_commission_type" "text" DEFAULT 'value'::"text" NOT NULL,
    "agent_commission_value" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "product_agent_commission_percentage_check" CHECK ((("agent_commission_type" <> 'percentage'::"text") OR ("agent_commission_value" <= (100)::numeric))),
    CONSTRAINT "product_agent_commission_type_check" CHECK (("agent_commission_type" = ANY (ARRAY['value'::"text", 'percentage'::"text"]))),
    CONSTRAINT "product_agent_commission_value_check" CHECK (("agent_commission_value" >= (0)::numeric)),
    CONSTRAINT "product_category_not_blank_check" CHECK (("length"("btrim"("category")) > 0)),
    CONSTRAINT "product_default_price_check" CHECK (("default_price" >= (0)::numeric)),
    CONSTRAINT "product_reseller_deduction_amount_check" CHECK ((("reseller_deduction_type" <> 'value'::"text") OR ("reseller_deduction_value" <= "default_price"))),
    CONSTRAINT "product_reseller_deduction_percentage_check" CHECK ((("reseller_deduction_type" <> 'percentage'::"text") OR ("reseller_deduction_value" <= (100)::numeric))),
    CONSTRAINT "product_reseller_deduction_type_check" CHECK (("reseller_deduction_type" = ANY (ARRAY['value'::"text", 'percentage'::"text"]))),
    CONSTRAINT "product_reseller_deduction_value_check" CHECK (("reseller_deduction_value" >= (0)::numeric)),
    CONSTRAINT "product_reseller_price_check" CHECK (("reseller_price" >= (0)::numeric)),
    CONSTRAINT "product_stock_status_check" CHECK (("stock_status" = ANY (ARRAY['in_stock'::"text", 'limited'::"text", 'out_of_stock'::"text"]))),
    CONSTRAINT "product_unit_label_not_blank_check" CHECK (("length"("btrim"("unit_label")) > 0))
);


ALTER TABLE "public"."product" OWNER TO "postgres";

--
-- Name: COLUMN "product"."category"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product"."category" IS 'Product category label. Defaults are provided by the admin UI and custom labels are inferred from saved products.';


--
-- Name: COLUMN "product"."unit_label"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product"."unit_label" IS 'Product unit label. Defaults are provided by the admin UI and custom labels are inferred from saved products.';


--
-- Name: COLUMN "product"."reseller_deduction_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product"."reseller_deduction_type" IS 'How reseller_price is derived from default_price: value or percentage.';


--
-- Name: COLUMN "product"."reseller_deduction_value"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product"."reseller_deduction_value" IS 'Deduction value applied to default_price when deriving reseller_price.';


--
-- Name: COLUMN "product"."agent_commission_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product"."agent_commission_type" IS 'How the default agent commission is calculated per product unit: value or percentage.';


--
-- Name: COLUMN "product"."agent_commission_value"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product"."agent_commission_value" IS 'Default agent commission value per product unit.';


--
-- Name: deactivate_product("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deactivate_product"("target_product_id" "uuid") RETURNS "public"."product"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  updated_product public.product;
begin
  update public.product
  set is_active = false,
      updated_at = now()
  where id = target_product_id
  returning * into updated_product;

  if updated_product.id is null then
    raise exception 'Product % was not found or cannot be deactivated by the current role.', target_product_id;
  end if;

  return updated_product;
end;
$$;


ALTER FUNCTION "public"."deactivate_product"("target_product_id" "uuid") OWNER TO "postgres";

--
-- Name: get_customer_orders_by_tracking_number("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_customer_orders_by_tracking_number"("p_tracking_number" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  normalized_tracking_number text;
  resolved_customer_id uuid;
  orders_payload jsonb;
  total_amount_due numeric;
begin
  normalized_tracking_number := upper(trim(coalesce(p_tracking_number, '')));

  if normalized_tracking_number !~ '^JHM-[A-Z2-9]{8}$' then
    return null;
  end if;

  select customer.id
  into resolved_customer_id
  from public.customer
  where customer.tracking_number = normalized_tracking_number;

  if resolved_customer_id is null then
    return null;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', order_row.id,
          'orderStatus', order_row.order_status,
          'paymentStatus', order_row.payment_status,
          'source', order_row.source,
          'createdAt', order_row.created_at,
          'orderTotal', coalesce(public.compute_invoice_total(order_row.id), 0),
          'amountDue', coalesce(public.compute_customer_amount_due(order_row.id), 0),
          'items', coalesce(order_items.items, '[]'::jsonb)
        )
        order by order_row.created_at desc
      ),
      '[]'::jsonb
    ),
    coalesce(
      sum(coalesce(public.compute_customer_amount_due(order_row.id), 0)),
      0
    )
  into orders_payload, total_amount_due
  from public."order" order_row
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'productName', product.name,
        'quantity', order_item.final_quantity,
        'unitLabel', product.unit_label,
        'addDetails', order_item.add_details
      )
      order by product.name
    ) as items
    from public.order_item
    join public.product
      on product.id = order_item.product_id
    where order_item.order_id = order_row.id
      and order_item.order_kind in ('customer', 'personal')
  ) as order_items
    on true
  where order_row.customer_id = resolved_customer_id
    and order_row.order_kind in ('customer', 'personal');

  return jsonb_build_object(
    'trackingNumber', normalized_tracking_number,
    'totalAmountDue', round(coalesce(total_amount_due, 0), 2),
    'orders', orders_payload
  );
end;
$_$;


ALTER FUNCTION "public"."get_customer_orders_by_tracking_number"("p_tracking_number" "text") OWNER TO "postgres";

--
-- Name: list_admin_activity_rows("text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_admin_activity_rows"("search_query" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10) RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  unified as (
    select
      'order-created:' || order_row.id::text as id,
      'order'::text as category,
      'Created order'::text as title,
      'Order ' || left(order_row.id::text, 8) || ' for ' || concat_ws(' ', customer_person.first_name, customer_person.last_name) as detail,
      order_row.created_at as occurred_at
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where order_row.order_kind in ('customer', 'personal')

    union all

    select
      'order-updated:' || order_row.id::text,
      'order',
      'Updated order',
      'Order ' || left(order_row.id::text, 8) || ' is ' || order_row.order_status || ' with payment ' || order_row.payment_status,
      order_row.updated_at
    from public."order" order_row
    where order_row.order_kind in ('customer', 'personal')
      and order_row.updated_at > order_row.created_at

    union all

    select
      'agent-order-created:' || distribution_order.id::text,
      'order',
      'Created agent order',
      'Agent order ' || left(distribution_order.id::text, 8) || ' for ' || coalesce(agent_person.display_name, 'Agent'),
      distribution_order.created_at
    from public."order" distribution_order
    join public.agent agent_row
      on agent_row.id = distribution_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    where distribution_order.order_kind = 'distribution'

    union all

    select
      'order-status:' || order_status_history.id::text,
      'order',
      'Updated order status',
      'Order ' || left(order_status_history.order_id::text, 8) || ' moved from ' || coalesce(order_status_history.from_status, 'new') || ' to ' || order_status_history.to_status,
      order_status_history.changed_at
    from public.order_status_history

    union all

    select
      'customer-created:' || customer.id::text,
      'customer',
      'Added new customer',
      concat_ws(' ', customer_person.first_name, customer_person.last_name) || case when customer.is_reseller then ' - reseller' else '' end,
      customer.created_at
    from public.customer
    join public.profile customer_person
      on customer_person.id = customer.profile_id

    union all

    select
      'product-created:' || product.id::text,
      'product',
      'Added product',
      product.name || ' - ' || product.category,
      product.created_at
    from public.product

    union all

    select
      'product-updated:' || product.id::text,
      'product',
      'Updated product',
      product.name || ' is ' || case when product.is_active then 'active' else 'inactive' end || ' and ' || product.stock_status,
      product.updated_at
    from public.product
    where product.updated_at > product.created_at

    union all

    select
      'invoice-created:' || invoice.id::text,
      'invoice',
      'Created invoice',
      invoice.invoice_number || ' for order ' || left(invoice.order_id::text, 8),
      invoice.created_at
    from public.invoice

    union all

    select
      'invoice-updated:' || invoice.id::text,
      'invoice',
      'Updated invoice',
      invoice.invoice_number || ' is ' || invoice.status,
      invoice.updated_at
    from public.invoice
    where invoice.updated_at > invoice.created_at

    union all

    select
      'page-created:' || page.id::text,
      'content',
      'Created content page',
      page.title || ' (' || page.status || ')',
      page.created_at
    from public.page

    union all

    select
      'page-updated:' || page.id::text,
      'content',
      'Updated content page',
      page.title || ' is ' || page.status,
      page.updated_at
    from public.page
    where page.updated_at > page.created_at
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where normalized.search_value is null
      or lower(unified.title || ' ' || unified.detail) like '%' || normalized.search_value || '%'
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.occurred_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'total_rows' order by paged.occurred_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;


ALTER FUNCTION "public"."list_admin_activity_rows"("search_query" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";

--
-- Name: list_admin_agent_rows("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_admin_agent_rows"("search_query" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10) RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."list_admin_agent_rows"("search_query" "text", "status_filter" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";

--
-- Name: list_admin_customer_rows("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_admin_customer_rows"("search_query" "text" DEFAULT NULL::"text", "customer_type_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10) RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."list_admin_customer_rows"("search_query" "text", "customer_type_filter" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";

--
-- Name: list_admin_invoice_rows("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_admin_invoice_rows"("search_query" "text" DEFAULT NULL::"text", "balance_status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10) RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(balance_status_filter, '') as balance_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      order_row.id as order_id,
      invoice.id as invoice_id,
      invoice.invoice_number,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      invoice.created_at as invoice_created_at,
      coalesce(public.compute_invoice_total(order_row.id), 0) as invoice_total,
      coalesce(public.compute_payment_total(order_row.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(order_row.id), 0) as balance,
      order_row.payment_status,
      lower(concat_ws(
        ' ',
        invoice.invoice_number,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email
      )) as search_text
    from public."order" order_row
    join public.invoice
      on invoice.order_id = order_row.id
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.balance_status_value is null or base_rows.payment_status = normalized.balance_status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.invoice_created_at desc, counted.invoice_id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.invoice_created_at desc, paged.invoice_id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;


ALTER FUNCTION "public"."list_admin_invoice_rows"("search_query" "text", "balance_status_filter" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";

--
-- Name: list_admin_order_rows("text", "text", "text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_admin_order_rows"("search_query" "text" DEFAULT NULL::"text", "source_filter" "text" DEFAULT NULL::"text", "order_status_filter" "text" DEFAULT NULL::"text", "payment_status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10) RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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
      order_row.id as order_id,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then order_item.partial_quantity
              else order_item.final_quantity
            end * order_item.unit_price
          ),
          0
        ),
        2
      ) as total_amount,
      round(
        coalesce(
          sum(
            case
              when not (
                order_row.agent_id is not null
                or order_row.parent_order_id is not null
                or order_row.converted_at is not null
              ) then
                0
              when coalesce(order_item.agent_commission_amount, 0) > 0 then
                order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    order_item.product_id,
                    case
                      when invoice.id is null then order_item.partial_quantity
                      else order_item.final_quantity
                    end,
                    order_item.unit_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public."order" order_row
    left join public.invoice
      on invoice.order_id = order_row.id
    left join public.order_item
      on order_item.order_id = order_row.id
      and order_item.order_kind in ('customer', 'personal')
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
    group by order_row.id
  ),
  customer_order_paid as (
    select
      order_row.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public."order" order_row
    left join public.payment
      on payment.order_id = order_row.id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
    group by order_row.id
  ),
  distribution_order_totals as (
    select
      distribution_order.id as order_id,
      round(coalesce(sum(order_item.partial_quantity * product.default_price), 0), 2) as total_amount,
      round(
        coalesce(
          sum(
            case
              when coalesce(order_item.agent_commission_amount, 0) > 0 then
                order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    order_item.product_id,
                    order_item.partial_quantity,
                    product.default_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public."order" distribution_order
    left join public.order_item
      on order_item.order_id = distribution_order.id
      and order_item.order_kind = 'distribution'
    left join public.product
      on product.id = order_item.product_id
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_paid as (
    select
      distribution_order.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public."order" distribution_order
    left join public."order" child_order
      on child_order.parent_order_id = distribution_order.id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    left join public.payment
      on payment.order_id = child_order.id
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_payment as (
    select
      distribution_order.id as order_id,
      count(child_order.id)::integer as linked_customer_count,
      count(child_order.id) filter (where child_order.order_status = 'pending')::integer
        as pending_customer_order_count,
      case
        when count(child_order.id) = 0 then 'unpaid'
        when bool_and(child_order.payment_status = 'paid') then 'paid'
        when bool_and(child_order.payment_status = 'unpaid') then 'unpaid'
        else 'partial'
      end as payment_status
    from public."order" distribution_order
    left join public."order" child_order
      on child_order.parent_order_id = distribution_order.id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_customer_search as (
    select
      child_order.parent_order_id as distribution_order_id,
      lower(string_agg(
        trim(concat_ws(
          ' ',
          customer_person.first_name,
          customer_person.last_name,
          customer_person.phone_number,
          customer_person.email,
          customer_person.address
        )),
        ' '
      )) as customer_search_text
    from public."order" child_order
    join public.customer
      on customer.id = child_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where child_order.parent_order_id is not null
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    group by child_order.parent_order_id
  ),
  unified as (
    select
      distribution_order.id,
      'agent'::text as row_type,
      distribution_order.created_at,
      null::date as release_date,
      distribution_order.order_status as status,
      coalesce(agent_person.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      distribution_order_payment.payment_status,
      coalesce(distribution_order_totals.total_amount, 0) as total_amount,
      coalesce(distribution_order_totals.commission_total, 0) as commission_total,
      coalesce(distribution_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(distribution_order_totals.total_amount, 0)
        - coalesce(distribution_order_totals.commission_total, 0)
        - coalesce(distribution_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/agent/' || distribution_order.id::text as href,
      distribution_order_payment.linked_customer_count,
      distribution_order_payment.pending_customer_order_count,
      lower(concat_ws(
        ' ',
        distribution_order.order_status,
        agent_person.display_name,
        agent_person.phone_number,
        distribution_order_customer_search.customer_search_text
      )) as search_text
    from public."order" distribution_order
    join public.agent agent_row
      on agent_row.id = distribution_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join distribution_order_totals
      on distribution_order_totals.order_id = distribution_order.id
    left join distribution_order_payment
      on distribution_order_payment.order_id = distribution_order.id
    left join distribution_order_paid
      on distribution_order_paid.order_id = distribution_order.id
    left join distribution_order_customer_search
      on distribution_order_customer_search.distribution_order_id = distribution_order.id
    where distribution_order.order_kind = 'distribution'

    union all

    select
      order_row.id,
      'customer'::text as row_type,
      order_row.created_at,
      order_row.release_date,
      order_row.order_status as status,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      order_row.source,
      case order_row.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(order_row.source, '_', ' '))
      end as source_label,
      order_row.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      coalesce(customer_order_totals.commission_total, 0) as commission_total,
      coalesce(customer_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(customer_order_totals.total_amount, 0)
        - coalesce(customer_order_totals.commission_total, 0)
        - coalesce(customer_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/customer/' || order_row.id::text as href,
      null::integer as linked_customer_count,
      null::integer as pending_customer_order_count,
      lower(concat_ws(
        ' ',
        order_row.source,
        order_row.order_status,
        order_row.payment_status,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        agent_person.display_name
      )) as search_text
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent agent_row
      on agent_row.id = order_row.agent_id
    left join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join customer_order_totals
      on customer_order_totals.order_id = order_row.id
    left join customer_order_paid
      on customer_order_paid.order_id = order_row.id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.parent_order_id is null
      and order_row.converted_at is null
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


ALTER FUNCTION "public"."list_admin_order_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";

--
-- Name: list_admin_sales_rows("text", "text", "text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_admin_sales_rows"("search_query" "text" DEFAULT NULL::"text", "source_filter" "text" DEFAULT NULL::"text", "order_status_filter" "text" DEFAULT NULL::"text", "payment_status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10) RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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
      order_row.id,
      order_row.created_at,
      order_row.sale_date as sale_date_value,
      order_row.sale_date::text as sale_date,
      order_row.release_date,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      order_row.source,
      case order_row.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(order_row.source, '_', ' '))
      end as source_label,
      order_row.order_status,
      order_row.payment_status,
      invoice.invoice_number,
      coalesce(public.compute_invoice_total(order_row.id), 0) as order_total,
      round(
        greatest(
          coalesce(public.compute_invoice_total(order_row.id), 0)
          - coalesce(public.compute_expected_commission(order_row.id), 0),
          0
        ),
        2
      ) as net_total,
      coalesce(public.compute_payment_total(order_row.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(order_row.id), 0) as balance,
      coalesce(payment_stats.payment_count, 0) as payment_count,
      '/admin/orders/customer/' || order_row.id::text as href,
      lower(concat_ws(
        ' ',
        order_row.source,
        order_row.order_status,
        order_row.payment_status,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        agent_person.display_name,
        invoice.invoice_number
      )) as search_text
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent agent_row
      on agent_row.id = order_row.agent_id
    left join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join lateral (
      select invoice.invoice_number
      from public.invoice
      where invoice.order_id = order_row.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) invoice on true
    left join lateral (
      select count(*)::integer as payment_count
      from public.payment
      where payment.order_id = order_row.id
    ) payment_stats on true
    where order_row.order_kind in ('customer', 'personal')
      and order_row.order_status = 'closed'
      and order_row.payment_status = 'paid'
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
    order by counted.sale_date_value desc nulls last, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'sale_date_value' - 'search_text' - 'source' - 'total_rows' order by paged.sale_date_value desc nulls last, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;


ALTER FUNCTION "public"."list_admin_sales_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";

--
-- Name: submit_agent_order("uuid", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_agent_id uuid;
  current_agent_customer_id uuid;
  resolved_customer_id uuid := target_customer_id;
  requested_release_date timestamptz := private.parse_schedule_timestamp(coalesce(customer_payload ->> 'releaseDate', ''), customer_payload ->> 'releaseTime');
  inserted_order_id uuid;
  inserted_agent_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
  is_personal_order boolean := coalesce(customer_payload ->> 'orderFor', '') = 'personal';
  resolved_order_kind text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select
    agent_row.id,
    agent_row.customer_id
  into
    current_agent_id,
    current_agent_customer_id
  from public.agent agent_row
  where agent_row.user_id = (select auth.uid())
    and agent_row.status = 'active'
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
    insert into public."order" (
      agent_id,
      order_status,
      release_date,
      submitted_by,
      order_kind,
      source,
      payment_status
    )
    values (
      current_agent_id,
      'pending_order',
      requested_release_date,
      (select auth.uid()),
      'distribution',
      'agent_submitted',
      'unpaid'
    )
    returning id into inserted_agent_order_id;
  else
    if is_personal_order then
      resolved_customer_id := current_agent_customer_id;

      if resolved_customer_id is null then
        insert into public.customer (
          assigned_agent_id,
          created_by,
          profile_id
        )
        select
          current_agent_id,
          (select auth.uid()),
          agent_row.profile_id
        from public.agent agent_row
        where agent_row.id = current_agent_id
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

      resolved_customer_id := private.create_customer_with_profile(
        trim(customer_payload ->> 'firstName'),
        trim(customer_payload ->> 'lastName'),
        trim(customer_payload ->> 'phoneNumber'),
        nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
        trim(customer_payload ->> 'address'),
        current_agent_id,
        false,
        (select auth.uid())
      );
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

    resolved_order_kind := case
      when is_personal_order then 'personal'
      else 'customer'
    end;

    insert into public."order" (
      customer_id,
      agent_id,
      source,
      order_status,
      payment_status,
      release_date,
      submitted_by,
      order_kind
    )
    values (
      resolved_customer_id,
      current_agent_id,
      'agent_submitted',
      'pending',
      'unpaid',
      requested_release_date,
      (select auth.uid()),
      resolved_order_kind
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
      insert into public.order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details,
        order_kind,
        unit_price,
        price_type,
        agent_commission_amount
      )
      select
        inserted_order_id,
        item_product_id,
        item_quantity,
        item_quantity,
        item_details,
        resolved_order_kind,
        case
          when customer_row.is_reseller then product_row.reseller_price
          else product_row.default_price
        end,
        case
          when customer_row.is_reseller then 'reseller'::text
          else 'retail'::text
        end,
        round(
          coalesce(
            case product_row.agent_commission_type
              when 'percentage' then
                coalesce(
                  case
                    when customer_row.is_reseller then product_row.reseller_price
                    else product_row.default_price
                  end,
                  0
                ) * product_row.agent_commission_value / 100
              else product_row.agent_commission_value
            end,
            0
          ) * item_quantity,
          2
        )
      from public.product product_row
      cross join public.customer customer_row
      where product_row.id = item_product_id
        and customer_row.id = resolved_customer_id
        and product_row.default_price is not null
        and product_row.reseller_price is not null;

      if not found then
        raise exception 'Product % does not have valid prices for order item pricing.', item_product_id;
      end if;
    else
      insert into public.order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details,
        order_kind,
        agent_commission_amount
      )
      values (
        inserted_agent_order_id,
        item_product_id,
        item_quantity,
        item_quantity,
        item_details,
        'distribution',
        coalesce(private.calculate_product_agent_commission(item_product_id, item_quantity, null), 0)
      );
    end if;
  end loop;

  if inserted_order_id is null and inserted_agent_order_id is null then
    raise exception 'At least one valid order item is required.';
  end if;

  return coalesce(inserted_order_id, inserted_agent_order_id);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Agent order payload contains an invalid product id, quantity, or release date.';
end;
$$;


ALTER FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") OWNER TO "postgres";

--
-- Name: submit_agent_received_payment("uuid", numeric, "text", "text", timestamp with time zone, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."submit_agent_received_payment"("target_order_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text" DEFAULT NULL::"text", "notes_value" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."submit_agent_received_payment"("target_order_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text") OWNER TO "postgres";

--
-- Name: submit_agent_received_payment_distribution("uuid"[], numeric, "text", "text", timestamp with time zone, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."submit_agent_received_payment_distribution"("target_order_ids" "uuid"[], "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text" DEFAULT NULL::"text", "notes_value" "text" DEFAULT NULL::"text") RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."submit_agent_received_payment_distribution"("target_order_ids" "uuid"[], "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text") OWNER TO "postgres";

--
-- Name: submit_guest_order("jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inserted_customer_id uuid;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
begin
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
    raise exception 'Delivery address is required.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  inserted_customer_id := private.create_customer_with_profile(
    trim(customer_payload ->> 'firstName'),
    trim(customer_payload ->> 'lastName'),
    trim(customer_payload ->> 'phoneNumber'),
    nullif(trim(customer_payload ->> 'email'), ''),
    trim(customer_payload ->> 'address')
  );

  insert into public."order" (
    customer_id,
    source,
    order_status,
    payment_status,
    order_kind
  )
  values (
    inserted_customer_id,
    'guest_shop',
    'pending',
    'unpaid',
    'customer'
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
      raise exception 'Product % is not available for public ordering.', item_product_id;
    end if;

    insert into public.order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      order_kind,
      unit_price,
      price_type,
      agent_commission_amount
    )
    select
      inserted_order_id,
      item_product_id,
      item_quantity,
      item_quantity,
      item_details,
      'customer',
      case
        when customer_row.is_reseller then product_row.reseller_price
        else product_row.default_price
      end,
      case
        when customer_row.is_reseller then 'reseller'::text
        else 'retail'::text
      end,
      0
    from public.product product_row
    cross join public.customer customer_row
    where product_row.id = item_product_id
      and customer_row.id = inserted_customer_id
      and product_row.default_price is not null
      and product_row.reseller_price is not null;

    if not found then
      raise exception 'Product % does not have valid prices for order item pricing.', item_product_id;
    end if;
  end loop;

  if not exists (
    select 1
    from public.order_item
    where order_id = inserted_order_id
      and order_kind in ('customer', 'personal')
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Order payload contains an invalid product id or quantity.';
end;
$$;


ALTER FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") OWNER TO "postgres";

--
-- Name: sync_invoice_sequence_from_settings(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_invoice_sequence_from_settings"("target_next" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if target_next < 1 then
    raise exception 'Invoice next number must be at least 1.';
  end if;

  perform setval('public.invoice_number_seq', target_next - 1, true);
end;
$$;


ALTER FUNCTION "public"."sync_invoice_sequence_from_settings"("target_next" bigint) OWNER TO "postgres";

--
-- Name: update_agent_order_item_quantity("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_item record;
  approved_distributed numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to update agent order quantity.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can update agent order item quantity.';
  end if;

  select
    order_item.id,
    order_item.order_id,
    order_item.product_id,
    order_item.partial_quantity
  into current_item
  from public.order_item
  where order_item.id = target_agent_order_item_id
    and order_item.order_kind = 'distribution'
  limit 1;

  if current_item.id is null then
    raise exception 'Agent order item was not found.';
  end if;

  if private.agent_order_item_is_fully_paid(current_item.order_id) then
    raise exception 'Agent order quantity cannot be edited after all customer orders are fully paid.';
  end if;

  if new_quantity is null or new_quantity <= 0 then
    raise exception 'Agent order item quantity must be greater than zero.';
  end if;

  approved_distributed := private.agent_order_approved_distributed_quantity(
    current_item.order_id,
    current_item.product_id
  );

  if new_quantity < approved_distributed then
    raise exception 'Cannot set quantity below distributed customer allocations.';
  end if;

  update public.order_item
  set partial_quantity = new_quantity,
      final_quantity = new_quantity,
      updated_at = now()
  where id = current_item.id;

  return current_item.id;
end;
$$;


ALTER FUNCTION "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) OWNER TO "postgres";

--
-- Name: admin_notification_read; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."admin_notification_read" (
    "notification_id" "text" NOT NULL,
    "admin_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_read_by" "uuid"
);


ALTER TABLE "public"."admin_notification_read" OWNER TO "postgres";

--
-- Name: TABLE "admin_notification_read"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."admin_notification_read" IS 'Tracks read state for computed admin notifications such as unpaid-order regular checks.';


--
-- Name: COLUMN "admin_notification_read"."notification_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."admin_notification_read"."notification_id" IS 'Stable notification identifier, for example unpaid-check-{customerId}-{thresholdKey}.';


--
-- Name: admin_role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."admin_role" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_role_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))),
    CONSTRAINT "admin_role_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."admin_role" OWNER TO "postgres";

--
-- Name: agent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."agent" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employee_id" "text",
    "customer_id" "uuid",
    "profile_id" "uuid" NOT NULL,
    "promoted_from_customer_id" "uuid",
    "promoted_from_customer_at" timestamp with time zone,
    CONSTRAINT "agent_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."agent" OWNER TO "postgres";

--
-- Name: COLUMN "agent"."promoted_from_customer_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."agent"."promoted_from_customer_id" IS 'Original customer id used only as promotion audit metadata after the customer row is removed.';


--
-- Name: COLUMN "agent"."promoted_from_customer_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."agent"."promoted_from_customer_at" IS 'Timestamp when a customer row was promoted into this agent row.';


--
-- Name: agent_received_payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."agent_received_payment" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference_number" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pending_admin_confirmation'::"text" NOT NULL,
    "received_by" "uuid",
    "confirmed_payment_id" "uuid",
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_terms" "text" NOT NULL,
    CONSTRAINT "agent_received_payment_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "agent_received_payment_confirmed_state_check" CHECK (((("status" = 'confirmed'::"text") AND ("confirmed_payment_id" IS NOT NULL) AND ("confirmed_by" IS NOT NULL) AND ("confirmed_at" IS NOT NULL)) OR (("status" <> 'confirmed'::"text") AND ("confirmed_payment_id" IS NULL)))),
    CONSTRAINT "agent_received_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['Cash'::"text", 'Check'::"text"]))),
    CONSTRAINT "agent_received_payment_status_check" CHECK (("status" = ANY (ARRAY['pending_admin_confirmation'::"text", 'confirmed'::"text", 'rejected'::"text"]))),
    CONSTRAINT "agent_received_payment_terms_check" CHECK (("payment_terms" = ANY (ARRAY['Cash on Delivery (COD)'::"text", 'Bank Transfer'::"text", 'Gcash'::"text"])))
);


ALTER TABLE "public"."agent_received_payment" OWNER TO "postgres";

--
-- Name: analytics_agent_daily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."analytics_agent_daily" (
    "day" "date" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "order_count" integer DEFAULT 0 NOT NULL,
    "expected_commission" numeric(12,2) DEFAULT 0 NOT NULL,
    "earned_commission" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_agent_daily_earned_commission_check" CHECK (("earned_commission" >= (0)::numeric)),
    CONSTRAINT "analytics_agent_daily_expected_commission_check" CHECK (("expected_commission" >= (0)::numeric)),
    CONSTRAINT "analytics_agent_daily_order_count_check" CHECK (("order_count" >= 0))
);


ALTER TABLE "public"."analytics_agent_daily" OWNER TO "postgres";

--
-- Name: analytics_daily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."analytics_daily" (
    "day" "date" NOT NULL,
    "order_count" integer DEFAULT 0 NOT NULL,
    "paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "outstanding_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "new_reseller_applications" integer DEFAULT 0 NOT NULL,
    "new_contact_inquiries" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_daily_inquiry_count_check" CHECK (("new_contact_inquiries" >= 0)),
    CONSTRAINT "analytics_daily_order_count_check" CHECK (("order_count" >= 0)),
    CONSTRAINT "analytics_daily_outstanding_balance_check" CHECK (("outstanding_balance" >= (0)::numeric)),
    CONSTRAINT "analytics_daily_paid_amount_check" CHECK (("paid_amount" >= (0)::numeric)),
    CONSTRAINT "analytics_daily_reseller_count_check" CHECK (("new_reseller_applications" >= 0))
);


ALTER TABLE "public"."analytics_daily" OWNER TO "postgres";

--
-- Name: analytics_product_daily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."analytics_product_daily" (
    "day" "date" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity_sold" numeric(12,3) DEFAULT 0 NOT NULL,
    "gross_sales" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_product_daily_gross_sales_check" CHECK (("gross_sales" >= (0)::numeric)),
    CONSTRAINT "analytics_product_daily_quantity_sold_check" CHECK (("quantity_sold" >= (0)::numeric))
);


ALTER TABLE "public"."analytics_product_daily" OWNER TO "postgres";

--
-- Name: contact_inquiry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."contact_inquiry" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone_number" "text",
    "message" "text" NOT NULL,
    "inquiry_status" "text" DEFAULT 'new'::"text" NOT NULL,
    "internal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_ip" "inet",
    "user_agent" "text",
    "admin_read_at" timestamp with time zone,
    "admin_read_by" "uuid",
    CONSTRAINT "contact_inquiry_status_check" CHECK (("inquiry_status" = ANY (ARRAY['new'::"text", 'reviewing'::"text", 'responded'::"text", 'closed'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."contact_inquiry" OWNER TO "postgres";

--
-- Name: COLUMN "contact_inquiry"."source_ip"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."contact_inquiry"."source_ip" IS 'Request IP captured by the trusted contact inquiry workflow for abuse controls.';


--
-- Name: COLUMN "contact_inquiry"."user_agent"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."contact_inquiry"."user_agent" IS 'Request user agent captured by the trusted contact inquiry workflow for abuse review.';


--
-- Name: COLUMN "contact_inquiry"."admin_read_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."contact_inquiry"."admin_read_at" IS 'Timestamp when an admin marked this contact inquiry as read.';


--
-- Name: COLUMN "contact_inquiry"."admin_read_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."contact_inquiry"."admin_read_by" IS 'Admin user who marked this contact inquiry as read.';


--
-- Name: customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."customer" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "assigned_agent_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_reseller" boolean DEFAULT false NOT NULL,
    "credit_limit" numeric(12,2) DEFAULT 1000 NOT NULL,
    "credit_limit_exceeded" boolean DEFAULT false NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "promoted_to_agent_id" "uuid",
    "promoted_to_agent_at" timestamp with time zone,
    "tracking_number" "text" NOT NULL,
    CONSTRAINT "customer_credit_limit_check" CHECK (("credit_limit" >= (0)::numeric))
);


ALTER TABLE "public"."customer" OWNER TO "postgres";

--
-- Name: COLUMN "customer"."is_reseller"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."customer"."is_reseller" IS 'When true, new order item price snapshots use product.reseller_price instead of product.default_price.';


--
-- Name: COLUMN "customer"."credit_limit"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."customer"."credit_limit" IS 'Maximum unpaid/partial order balance the customer may stack before requiring admin confirmation.';


--
-- Name: COLUMN "customer"."credit_limit_exceeded"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."customer"."credit_limit_exceeded" IS 'Derived marker indicating the customer unpaid/partial balance currently exceeds credit_limit.';


--
-- Name: COLUMN "customer"."promoted_to_agent_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."customer"."promoted_to_agent_id" IS 'Agent record created when this customer role was promoted. Promoted customers are hidden from active customer management.';


--
-- Name: COLUMN "customer"."promoted_to_agent_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."customer"."promoted_to_agent_at" IS 'Timestamp when this customer role was promoted to an agent role.';


--
-- Name: customer_registration_link; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."customer_registration_link" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "use_count" integer DEFAULT 0 NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "customer_registration_link_use_count_check" CHECK (("use_count" >= 0))
);


ALTER TABLE "public"."customer_registration_link" OWNER TO "postgres";

--
-- Name: TABLE "customer_registration_link"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."customer_registration_link" IS 'Temporary customer registration links generated by admins for agent-assisted customer registration.';


--
-- Name: customer_registration_link_agent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."customer_registration_link_agent" (
    "link_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "notified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."customer_registration_link_agent" OWNER TO "postgres";

--
-- Name: invoice; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."invoice" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"(),
    "due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoice_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'partially_paid'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."invoice" OWNER TO "postgres";

--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";

--
-- Name: order; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "agent_id" "uuid",
    "source" "text" NOT NULL,
    "order_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "submitted_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_read_at" timestamp with time zone,
    "admin_read_by" "uuid",
    "notes" "text",
    "release_date" timestamp with time zone,
    "sale_date" timestamp with time zone,
    "order_kind" "text" DEFAULT 'customer'::"text" NOT NULL,
    "parent_order_id" "uuid",
    "converted_at" timestamp with time zone,
    "converted_by" "uuid",
    CONSTRAINT "customer_order_approval_check" CHECK (((("approved_by" IS NULL) AND ("approved_at" IS NULL)) OR (("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "customer_order_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'partial'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "customer_order_source_check" CHECK (("source" = ANY (ARRAY['guest_shop'::"text", 'agent_submitted'::"text", 'admin_manual'::"text"]))),
    CONSTRAINT "order_kind_check" CHECK (("order_kind" = ANY (ARRAY['customer'::"text", 'personal'::"text", 'distribution'::"text"]))),
    CONSTRAINT "order_status_by_kind_check" CHECK (((("order_kind" = 'distribution'::"text") AND ("order_status" = ANY (ARRAY['pending_customers'::"text", 'pending_order'::"text", 'processing'::"text", 'closed'::"text"]))) OR (("order_kind" = ANY (ARRAY['customer'::"text", 'personal'::"text"])) AND ("order_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'closed'::"text"])))))
);


ALTER TABLE "public"."order" OWNER TO "postgres";

--
-- Name: TABLE "order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."order" IS 'Unified order table (customer, personal, and distribution orders).';


--
-- Name: COLUMN "order"."admin_read_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order"."admin_read_at" IS 'Timestamp when an admin marked this externally submitted order as read.';


--
-- Name: COLUMN "order"."admin_read_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order"."admin_read_by" IS 'Admin user who marked this externally submitted order as read.';


--
-- Name: COLUMN "order"."order_kind"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order"."order_kind" IS 'customer | personal | distribution';


--
-- Name: COLUMN "order"."parent_order_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order"."parent_order_id" IS 'Self-FK to parent distribution order. Replaces legacy agent_order_id and converted_to_agent_order_id.';


--
-- Name: order_item; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order_item" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "partial_quantity" numeric(12,3) NOT NULL,
    "final_quantity" numeric(12,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "add_details" "text",
    "agent_commission_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "agent_commission_set_by" "uuid",
    "agent_commission_set_at" timestamp with time zone,
    "unit_price" numeric(12,2),
    "price_type" "text",
    "agent_commission_paid" boolean DEFAULT false NOT NULL,
    "agent_order_quantity_increase" numeric(12,3) DEFAULT 0 NOT NULL,
    "order_kind" "text" NOT NULL,
    CONSTRAINT "customer_order_item_agent_order_quantity_increase_check" CHECK (("agent_order_quantity_increase" >= (0)::numeric)),
    CONSTRAINT "customer_order_item_commission_amount_check" CHECK (("agent_commission_amount" >= (0)::numeric)),
    CONSTRAINT "customer_order_item_commission_set_check" CHECK (((("agent_commission_amount" = (0)::numeric) AND ("agent_commission_paid" = false) AND ("agent_commission_set_by" IS NULL) AND ("agent_commission_set_at" IS NULL)) OR ("agent_commission_amount" > (0)::numeric))),
    CONSTRAINT "customer_order_item_final_quantity_check" CHECK (("final_quantity" > (0)::numeric)),
    CONSTRAINT "customer_order_item_partial_quantity_check" CHECK (("partial_quantity" > (0)::numeric)),
    CONSTRAINT "order_item_order_kind_check" CHECK (("order_kind" = ANY (ARRAY['customer'::"text", 'personal'::"text", 'distribution'::"text"]))),
    CONSTRAINT "order_item_price_type_check" CHECK ((("price_type" IS NULL) OR ("price_type" = ANY (ARRAY['retail'::"text", 'reseller'::"text"])))),
    CONSTRAINT "order_item_pricing_by_kind_check" CHECK (((("order_kind" = 'distribution'::"text") AND ("unit_price" IS NULL) AND ("price_type" IS NULL)) OR (("order_kind" = ANY (ARRAY['customer'::"text", 'personal'::"text"])) AND ("unit_price" IS NOT NULL) AND ("price_type" IS NOT NULL)))),
    CONSTRAINT "order_item_unit_price_check" CHECK ((("unit_price" IS NULL) OR ("unit_price" >= (0)::numeric)))
);


ALTER TABLE "public"."order_item" OWNER TO "postgres";

--
-- Name: COLUMN "order_item"."partial_quantity"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_item"."partial_quantity" IS 'Order slip quantity. Used for order reference totals.';


--
-- Name: COLUMN "order_item"."final_quantity"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_item"."final_quantity" IS 'Sales invoice quantity. Used for final invoice totals, payment balance, and proportional commission calculations.';


--
-- Name: COLUMN "order_item"."unit_price"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_item"."unit_price" IS 'Price snapshot used for order and invoice totals. Set from product default or reseller price when the item is created.';


--
-- Name: COLUMN "order_item"."price_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_item"."price_type" IS 'Price source for the unit_price snapshot: retail or reseller.';


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "order_status_history_from_status_check" CHECK ((("from_status" IS NULL) OR ("from_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'closed'::"text", 'pending_customers'::"text", 'pending_order'::"text"])))),
    CONSTRAINT "order_status_history_to_status_check" CHECK (("to_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'closed'::"text", 'pending_customers'::"text", 'pending_order'::"text"])))
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";

--
-- Name: page; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."page" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "page_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."page" OWNER TO "postgres";

--
-- Name: page_section; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."page_section" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "page_section_content_object_check" CHECK (("jsonb_typeof"("content") = 'object'::"text")),
    CONSTRAINT "page_section_sort_order_check" CHECK (("sort_order" >= 0)),
    CONSTRAINT "page_section_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."page_section" OWNER TO "postgres";

--
-- Name: payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."payment" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid",
    "reference_number" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_terms" "text" NOT NULL,
    CONSTRAINT "payment_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payment_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['Cash'::"text", 'Check'::"text"]))),
    CONSTRAINT "payment_payment_terms_check" CHECK (("payment_terms" = ANY (ARRAY['Cash on Delivery (COD)'::"text", 'Bank Transfer'::"text", 'Gcash'::"text"])))
);


ALTER TABLE "public"."payment" OWNER TO "postgres";

--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "platform_settings_singleton" CHECK (("id" = 'default'::"text"))
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";

-- The singleton is required by invoice/order-slip numbering triggers. It is
-- durable application state, so it is part of the baseline rather than an
-- optional local content seed.
INSERT INTO "public"."platform_settings" ("id", "settings")
VALUES (
    'default',
    jsonb_build_object(
        'businessProfile', jsonb_build_object(
            'tradeName', 'Meat and Poultry Products',
            'legalName', '',
            'address', 'Brgy. Tolo-Tolo Consolacion, Cebu',
            'phone', '09322159289 | 09177770118',
            'tin', '',
            'logoPath', null,
            'primaryEmail', 'jehmarp2020@gmail.com',
            'secondaryEmail', ''
        ),
        'documentPayment', jsonb_build_object(
            'instructions', '',
            'bankName', '',
            'accountName', '',
            'accountNumber', '',
            'gcashNumber', '',
            'mayaNumber', ''
        ),
        'defaults', jsonb_build_object('customerCreditLimit', 1000),
        'notifications', jsonb_build_object(
            'routes', jsonb_build_array(
                jsonb_build_object('event', 'new_order', 'primaryEmail', '', 'secondaryEmail', ''),
                jsonb_build_object('event', 'reseller_application', 'primaryEmail', '', 'secondaryEmail', ''),
                jsonb_build_object('event', 'contact_inquiry', 'primaryEmail', '', 'secondaryEmail', ''),
                jsonb_build_object('event', 'credit_alert', 'primaryEmail', '', 'secondaryEmail', '')
            )
        ),
        'documentNumbering', jsonb_build_object(
            'invoicePrefix', 'INV-',
            'invoiceNext', 1,
            'orderSlipPrefix', 'OS-',
            'orderSlipNext', 1
        )
    )
);

--
-- Name: TABLE "platform_settings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."platform_settings" IS 'Singleton JSON document for admin-managed platform configuration.';


--
-- Name: profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."profile" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone_number" "text",
    "address" "text"
);


ALTER TABLE "public"."profile" OWNER TO "postgres";

--
-- Name: reseller_application; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."reseller_application" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "address" "text" NOT NULL,
    "planned_transaction_type" "text" NOT NULL,
    "expected_quantity_per_week" "text" NOT NULL,
    "contact_number" "text" NOT NULL,
    "message" "text",
    "application_status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "email_delivery_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "price_list_sent_at" timestamp with time zone,
    "email_error" "text",
    "internal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_ip" "inet",
    "user_agent" "text",
    "admin_read_at" timestamp with time zone,
    "admin_read_by" "uuid",
    CONSTRAINT "reseller_application_email_delivery_status_check" CHECK (("email_delivery_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"]))),
    CONSTRAINT "reseller_application_status_check" CHECK (("application_status" = ANY (ARRAY['submitted'::"text", 'contacted'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."reseller_application" OWNER TO "postgres";

--
-- Name: COLUMN "reseller_application"."source_ip"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."reseller_application"."source_ip" IS 'Request IP captured by the trusted reseller application workflow for abuse controls.';


--
-- Name: COLUMN "reseller_application"."user_agent"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."reseller_application"."user_agent" IS 'Request user agent captured by the trusted reseller application workflow for abuse review.';


--
-- Name: COLUMN "reseller_application"."admin_read_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."reseller_application"."admin_read_at" IS 'Timestamp when an admin marked this reseller application as read.';


--
-- Name: COLUMN "reseller_application"."admin_read_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."reseller_application"."admin_read_by" IS 'Admin user who marked this reseller application as read.';


--
-- Name: admin_notification_read admin_notification_read_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_notification_read"
    ADD CONSTRAINT "admin_notification_read_pkey" PRIMARY KEY ("notification_id");


--
-- Name: admin_role admin_role_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_role"
    ADD CONSTRAINT "admin_role_pkey" PRIMARY KEY ("id");


--
-- Name: admin_role admin_role_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_role"
    ADD CONSTRAINT "admin_role_user_id_key" UNIQUE ("user_id");


--
-- Name: agent agent_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_customer_id_key" UNIQUE ("customer_id");


--
-- Name: agent agent_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_employee_id_key" UNIQUE ("employee_id");


--
-- Name: agent agent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_pkey" PRIMARY KEY ("id");


--
-- Name: agent agent_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_profile_id_key" UNIQUE ("profile_id");


--
-- Name: agent_received_payment agent_received_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_received_payment"
    ADD CONSTRAINT "agent_received_payment_pkey" PRIMARY KEY ("id");


--
-- Name: agent agent_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_user_id_key" UNIQUE ("user_id");


--
-- Name: analytics_agent_daily analytics_agent_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_agent_daily"
    ADD CONSTRAINT "analytics_agent_daily_pkey" PRIMARY KEY ("day", "agent_id");


--
-- Name: analytics_daily analytics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_daily"
    ADD CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("day");


--
-- Name: analytics_product_daily analytics_product_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_product_daily"
    ADD CONSTRAINT "analytics_product_daily_pkey" PRIMARY KEY ("day", "product_id");


--
-- Name: contact_inquiry contact_inquiry_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_inquiry"
    ADD CONSTRAINT "contact_inquiry_pkey" PRIMARY KEY ("id");


--
-- Name: order_item customer_order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_item"
    ADD CONSTRAINT "customer_order_item_pkey" PRIMARY KEY ("id");


--
-- Name: order customer_order_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "customer_order_pkey" PRIMARY KEY ("id");


--
-- Name: order_status_history customer_order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "customer_order_status_history_pkey" PRIMARY KEY ("id");


--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_pkey" PRIMARY KEY ("id");


--
-- Name: customer_registration_link_agent customer_registration_link_agent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link_agent"
    ADD CONSTRAINT "customer_registration_link_agent_pkey" PRIMARY KEY ("link_id", "agent_id");


--
-- Name: customer_registration_link customer_registration_link_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link"
    ADD CONSTRAINT "customer_registration_link_pkey" PRIMARY KEY ("id");


--
-- Name: customer_registration_link customer_registration_link_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link"
    ADD CONSTRAINT "customer_registration_link_token_hash_key" UNIQUE ("token_hash");


--
-- Name: customer_registration_link customer_registration_link_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link"
    ADD CONSTRAINT "customer_registration_link_token_key" UNIQUE ("token");


--
-- Name: invoice invoice_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_invoice_number_key" UNIQUE ("invoice_number");


--
-- Name: invoice invoice_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_order_id_key" UNIQUE ("order_id");


--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_pkey" PRIMARY KEY ("id");


--
-- Name: page page_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_pkey" PRIMARY KEY ("id");


--
-- Name: page_section page_section_page_id_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page_section"
    ADD CONSTRAINT "page_section_page_id_sort_order_key" UNIQUE ("page_id", "sort_order");


--
-- Name: page_section page_section_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page_section"
    ADD CONSTRAINT "page_section_pkey" PRIMARY KEY ("id");


--
-- Name: page page_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_slug_key" UNIQUE ("slug");


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_pkey" PRIMARY KEY ("id");


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product"
    ADD CONSTRAINT "product_pkey" PRIMARY KEY ("id");


--
-- Name: profile profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");


--
-- Name: reseller_application reseller_application_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reseller_application"
    ADD CONSTRAINT "reseller_application_pkey" PRIMARY KEY ("id");


--
-- Name: admin_notification_read_admin_read_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "admin_notification_read_admin_read_at_idx" ON "public"."admin_notification_read" USING "btree" ("admin_read_at" DESC);


--
-- Name: agent_customer_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "agent_customer_id_idx" ON "public"."agent" USING "btree" ("customer_id");


--
-- Name: agent_profile_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "agent_profile_id_idx" ON "public"."agent" USING "btree" ("profile_id");


--
-- Name: agent_received_payment_agent_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "agent_received_payment_agent_status_idx" ON "public"."agent_received_payment" USING "btree" ("agent_id", "status");


--
-- Name: agent_received_payment_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "agent_received_payment_order_id_idx" ON "public"."agent_received_payment" USING "btree" ("order_id");


--
-- Name: agent_received_payment_pending_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "agent_received_payment_pending_idx" ON "public"."agent_received_payment" USING "btree" ("created_at" DESC) WHERE ("status" = 'pending_admin_confirmation'::"text");


--
-- Name: analytics_agent_daily_agent_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "analytics_agent_daily_agent_id_idx" ON "public"."analytics_agent_daily" USING "btree" ("agent_id");


--
-- Name: analytics_product_daily_product_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "analytics_product_daily_product_id_idx" ON "public"."analytics_product_daily" USING "btree" ("product_id");


--
-- Name: contact_inquiry_admin_unread_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "contact_inquiry_admin_unread_idx" ON "public"."contact_inquiry" USING "btree" ("created_at" DESC) WHERE (("admin_read_at" IS NULL) AND ("inquiry_status" = 'new'::"text"));


--
-- Name: contact_inquiry_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "contact_inquiry_created_at_idx" ON "public"."contact_inquiry" USING "btree" ("created_at" DESC);


--
-- Name: contact_inquiry_email_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "contact_inquiry_email_created_at_idx" ON "public"."contact_inquiry" USING "btree" ("lower"("email"), "created_at" DESC) WHERE ("email" IS NOT NULL);


--
-- Name: contact_inquiry_source_ip_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "contact_inquiry_source_ip_created_at_idx" ON "public"."contact_inquiry" USING "btree" ("source_ip", "created_at" DESC) WHERE ("source_ip" IS NOT NULL);


--
-- Name: contact_inquiry_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "contact_inquiry_status_idx" ON "public"."contact_inquiry" USING "btree" ("inquiry_status");


--
-- Name: customer_active_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_active_created_at_idx" ON "public"."customer" USING "btree" ("created_at" DESC) WHERE ("promoted_to_agent_id" IS NULL);


--
-- Name: customer_assigned_agent_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_assigned_agent_id_idx" ON "public"."customer" USING "btree" ("assigned_agent_id");


--
-- Name: customer_created_by_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_created_by_idx" ON "public"."customer" USING "btree" ("created_by");


--
-- Name: customer_order_admin_unread_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_admin_unread_idx" ON "public"."order" USING "btree" ("created_at" DESC) WHERE (("admin_read_at" IS NULL) AND ("source" <> 'admin_manual'::"text") AND ("order_status" = 'pending'::"text"));


--
-- Name: customer_order_agent_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_agent_id_idx" ON "public"."order" USING "btree" ("agent_id");


--
-- Name: customer_order_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_created_at_idx" ON "public"."order" USING "btree" ("created_at" DESC);


--
-- Name: customer_order_customer_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_customer_id_idx" ON "public"."order" USING "btree" ("customer_id");


--
-- Name: customer_order_item_commission_paid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_item_commission_paid_idx" ON "public"."order_item" USING "btree" ("agent_commission_paid");


--
-- Name: customer_order_item_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_item_order_id_idx" ON "public"."order_item" USING "btree" ("order_id");


--
-- Name: customer_order_item_product_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_item_product_id_idx" ON "public"."order_item" USING "btree" ("product_id");


--
-- Name: customer_order_open_queue_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_open_queue_idx" ON "public"."order" USING "btree" ("created_at" DESC, "id" DESC) WHERE (NOT (("order_status" = 'closed'::"text") AND ("payment_status" = 'paid'::"text")));


--
-- Name: customer_order_order_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_order_status_idx" ON "public"."order" USING "btree" ("order_status");


--
-- Name: customer_order_payment_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_payment_status_idx" ON "public"."order" USING "btree" ("payment_status");


--
-- Name: customer_order_release_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_release_date_idx" ON "public"."order" USING "btree" ("release_date") WHERE ("release_date" IS NOT NULL);


--
-- Name: customer_order_sale_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_sale_date_idx" ON "public"."order" USING "btree" ("sale_date" DESC) WHERE ("sale_date" IS NOT NULL);


--
-- Name: customer_order_sales_closed_paid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_sales_closed_paid_idx" ON "public"."order" USING "btree" ("created_at" DESC, "id" DESC) WHERE (("order_status" = 'closed'::"text") AND ("payment_status" = 'paid'::"text"));


--
-- Name: customer_order_sales_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_sales_source_idx" ON "public"."order" USING "btree" ("source", "created_at" DESC, "id" DESC) WHERE (("order_status" = 'closed'::"text") AND ("payment_status" = 'paid'::"text"));


--
-- Name: customer_order_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_source_idx" ON "public"."order" USING "btree" ("source");


--
-- Name: customer_order_status_history_changed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_status_history_changed_at_idx" ON "public"."order_status_history" USING "btree" ("changed_at" DESC);


--
-- Name: customer_order_status_history_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_order_status_history_order_id_idx" ON "public"."order_status_history" USING "btree" ("order_id");


--
-- Name: customer_profile_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_profile_id_idx" ON "public"."customer" USING "btree" ("profile_id");


--
-- Name: customer_promoted_to_agent_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_promoted_to_agent_id_idx" ON "public"."customer" USING "btree" ("promoted_to_agent_id");


--
-- Name: customer_registration_link_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_registration_link_active_idx" ON "public"."customer_registration_link" USING "btree" ("expires_at", "created_at" DESC) WHERE ("revoked_at" IS NULL);


--
-- Name: customer_registration_link_agent_agent_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "customer_registration_link_agent_agent_id_idx" ON "public"."customer_registration_link_agent" USING "btree" ("agent_id", "notified_at" DESC);


--
-- Name: customer_tracking_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "customer_tracking_number_key" ON "public"."customer" USING "btree" ("tracking_number");


--
-- Name: invoice_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_status_idx" ON "public"."invoice" USING "btree" ("status");


--
-- Name: page_section_page_id_sort_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "page_section_page_id_sort_order_idx" ON "public"."page_section" USING "btree" ("page_id", "sort_order");


--
-- Name: page_section_page_id_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "page_section_page_id_status_idx" ON "public"."page_section" USING "btree" ("page_id", "status");


--
-- Name: page_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "page_status_idx" ON "public"."page" USING "btree" ("status");


--
-- Name: payment_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "payment_order_id_idx" ON "public"."payment" USING "btree" ("order_id");


--
-- Name: payment_payment_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "payment_payment_date_idx" ON "public"."payment" USING "btree" ("payment_date" DESC);


--
-- Name: product_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "product_category_idx" ON "public"."product" USING "btree" ("category");


--
-- Name: product_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "product_is_active_idx" ON "public"."product" USING "btree" ("is_active");


--
-- Name: product_stock_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "product_stock_status_idx" ON "public"."product" USING "btree" ("stock_status");


--
-- Name: profile_email_lower_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "profile_email_lower_unique_idx" ON "public"."profile" USING "btree" ("lower"("email")) WHERE (("email" IS NOT NULL) AND ("email" <> ''::"text"));


--
-- Name: profile_phone_number_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "profile_phone_number_unique_idx" ON "public"."profile" USING "btree" ("phone_number") WHERE (("phone_number" IS NOT NULL) AND ("phone_number" <> ''::"text"));


--
-- Name: profile_user_id_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "profile_user_id_unique_idx" ON "public"."profile" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: reseller_application_admin_unread_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reseller_application_admin_unread_idx" ON "public"."reseller_application" USING "btree" ("created_at" DESC) WHERE (("admin_read_at" IS NULL) AND ("application_status" = 'submitted'::"text"));


--
-- Name: reseller_application_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reseller_application_created_at_idx" ON "public"."reseller_application" USING "btree" ("created_at" DESC);


--
-- Name: reseller_application_email_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reseller_application_email_created_at_idx" ON "public"."reseller_application" USING "btree" ("lower"("email"), "created_at" DESC);


--
-- Name: reseller_application_email_delivery_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reseller_application_email_delivery_status_idx" ON "public"."reseller_application" USING "btree" ("email_delivery_status");


--
-- Name: reseller_application_source_ip_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reseller_application_source_ip_created_at_idx" ON "public"."reseller_application" USING "btree" ("source_ip", "created_at" DESC) WHERE ("source_ip" IS NOT NULL);


--
-- Name: reseller_application_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reseller_application_status_idx" ON "public"."reseller_application" USING "btree" ("application_status");


--
-- Name: order apply_agent_order_customer_approval_on_status_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "apply_agent_order_customer_approval_on_status_change" AFTER UPDATE OF "order_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."apply_agent_order_customer_approval_on_status_change"();


--
-- Name: payment block_payment_mutation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "block_payment_mutation" BEFORE DELETE OR UPDATE ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "private"."block_payment_mutation"();


--
-- Name: order block_pending_agent_order_customer_link; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "block_pending_agent_order_customer_link" BEFORE INSERT OR UPDATE OF "parent_order_id" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."block_pending_agent_order_customer_link"();


--
-- Name: product block_referenced_product_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "block_referenced_product_delete" BEFORE DELETE ON "public"."product" FOR EACH ROW EXECUTE FUNCTION "private"."block_referenced_product_delete"();


--
-- Name: order close_paid_customer_order_after_payment_status_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "close_paid_customer_order_after_payment_status_change" AFTER UPDATE OF "payment_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."close_paid_customer_order_after_payment_status_change"();


--
-- Name: invoice invoice_assign_number_from_settings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "invoice_assign_number_from_settings" BEFORE INSERT ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "public"."assign_invoice_number_from_settings"();


--
-- Name: invoice record_invoice_status_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_invoice_status_update" AFTER UPDATE OF "status" ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "private"."record_invoice_status_update"();


--
-- Name: order record_order_status_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_order_status_history" AFTER INSERT OR UPDATE OF "order_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."record_order_status_history"();


--
-- Name: payment record_payment_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_payment_insert" AFTER INSERT ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "private"."record_payment_insert"();


--
-- Name: order refresh_agent_order_after_customer_order_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_agent_order_after_customer_order_change" AFTER INSERT OR DELETE OR UPDATE OF "parent_order_id", "payment_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_agent_order_after_customer_order_change"();


--
-- Name: customer refresh_customer_credit_after_limit_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_customer_credit_after_limit_change" AFTER UPDATE OF "credit_limit" ON "public"."customer" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_customer_credit_after_limit_change"();


--
-- Name: order refresh_customer_credit_after_order_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_customer_credit_after_order_change" AFTER INSERT OR DELETE OR UPDATE OF "customer_id", "payment_status", "order_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_customer_credit_after_order_change"();


--
-- Name: order_item refresh_customer_credit_after_order_item_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_customer_credit_after_order_item_change" AFTER INSERT OR DELETE OR UPDATE OF "partial_quantity", "final_quantity", "unit_price" ON "public"."order_item" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_customer_credit_after_order_item_change"();


--
-- Name: payment refresh_customer_credit_after_payment_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_customer_credit_after_payment_change" AFTER INSERT OR DELETE OR UPDATE OF "amount", "order_id" ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_customer_credit_after_payment_change"();


--
-- Name: invoice refresh_order_after_invoice_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_order_after_invoice_insert" AFTER INSERT ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_order_after_invoice_insert"();


--
-- Name: order_item refresh_order_after_item_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_order_after_item_change" AFTER INSERT OR DELETE OR UPDATE OF "final_quantity", "partial_quantity", "product_id", "unit_price", "price_type", "agent_commission_amount" ON "public"."order_item" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_order_after_item_change"();


--
-- Name: order refresh_order_after_order_status_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "refresh_order_after_order_status_change" AFTER UPDATE OF "order_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_order_after_order_status_change"();


--
-- Name: customer set_customer_tracking_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_customer_tracking_number" BEFORE INSERT ON "public"."customer" FOR EACH ROW EXECUTE FUNCTION "private"."set_customer_tracking_number"();


--
-- Name: order sync_agent_order_status_from_customer_link; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sync_agent_order_status_from_customer_link" AFTER INSERT OR UPDATE OF "parent_order_id" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."sync_agent_order_status_from_customer_link"();


--
-- Name: order_item sync_order_item_final_quantity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sync_order_item_final_quantity" BEFORE INSERT OR UPDATE OF "partial_quantity" ON "public"."order_item" FOR EACH ROW EXECUTE FUNCTION "private"."sync_order_item_final_quantity"();


--
-- Name: order_item sync_order_item_price_snapshot; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sync_order_item_price_snapshot" BEFORE INSERT OR UPDATE OF "product_id", "partial_quantity" ON "public"."order_item" FOR EACH ROW EXECUTE FUNCTION "private"."sync_order_item_price_snapshot"();


--
-- Name: order sync_order_sale_date; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sync_order_sale_date" BEFORE INSERT OR UPDATE OF "order_status", "payment_status", "sale_date", "order_kind" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."sync_order_sale_date"();


--
-- Name: invoice validate_invoice_status_transition; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_invoice_status_transition" BEFORE UPDATE OF "status" ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "private"."validate_invoice_status_transition"();


--
-- Name: order validate_order_status_transition; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_order_status_transition" BEFORE UPDATE OF "order_status" ON "public"."order" FOR EACH ROW EXECUTE FUNCTION "private"."validate_order_status_transition"();


--
-- Name: admin_notification_read admin_notification_read_admin_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_notification_read"
    ADD CONSTRAINT "admin_notification_read_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_role admin_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_role"
    ADD CONSTRAINT "admin_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: agent agent_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE SET NULL;


--
-- Name: agent agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE RESTRICT;


--
-- Name: agent_received_payment agent_received_payment_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_received_payment"
    ADD CONSTRAINT "agent_received_payment_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE RESTRICT;


--
-- Name: agent_received_payment agent_received_payment_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_received_payment"
    ADD CONSTRAINT "agent_received_payment_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: agent_received_payment agent_received_payment_confirmed_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_received_payment"
    ADD CONSTRAINT "agent_received_payment_confirmed_payment_id_fkey" FOREIGN KEY ("confirmed_payment_id") REFERENCES "public"."payment"("id") ON DELETE RESTRICT;


--
-- Name: agent_received_payment agent_received_payment_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_received_payment"
    ADD CONSTRAINT "agent_received_payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE RESTRICT;


--
-- Name: agent_received_payment agent_received_payment_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_received_payment"
    ADD CONSTRAINT "agent_received_payment_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: agent agent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent"
    ADD CONSTRAINT "agent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: analytics_agent_daily analytics_agent_daily_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_agent_daily"
    ADD CONSTRAINT "analytics_agent_daily_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE CASCADE;


--
-- Name: analytics_product_daily analytics_product_daily_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_product_daily"
    ADD CONSTRAINT "analytics_product_daily_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE CASCADE;


--
-- Name: contact_inquiry contact_inquiry_admin_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_inquiry"
    ADD CONSTRAINT "contact_inquiry_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: customer customer_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agent"("id") ON DELETE SET NULL;


--
-- Name: customer customer_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: order customer_order_admin_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "customer_order_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: order customer_order_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "customer_order_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE SET NULL;


--
-- Name: order customer_order_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "customer_order_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: order customer_order_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "customer_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE RESTRICT;


--
-- Name: order_item customer_order_item_agent_commission_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_item"
    ADD CONSTRAINT "customer_order_item_agent_commission_set_by_fkey" FOREIGN KEY ("agent_commission_set_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: order_item customer_order_item_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_item"
    ADD CONSTRAINT "customer_order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE CASCADE;


--
-- Name: order_item customer_order_item_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_item"
    ADD CONSTRAINT "customer_order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE RESTRICT;


--
-- Name: order_status_history customer_order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "customer_order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: order_status_history customer_order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "customer_order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE CASCADE;


--
-- Name: order customer_order_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "customer_order_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: customer customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE RESTRICT;


--
-- Name: customer customer_promoted_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_promoted_to_agent_id_fkey" FOREIGN KEY ("promoted_to_agent_id") REFERENCES "public"."agent"("id") ON DELETE SET NULL;


--
-- Name: customer_registration_link_agent customer_registration_link_agent_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link_agent"
    ADD CONSTRAINT "customer_registration_link_agent_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE CASCADE;


--
-- Name: customer_registration_link_agent customer_registration_link_agent_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link_agent"
    ADD CONSTRAINT "customer_registration_link_agent_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."customer_registration_link"("id") ON DELETE CASCADE;


--
-- Name: customer_registration_link customer_registration_link_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link"
    ADD CONSTRAINT "customer_registration_link_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: customer_registration_link customer_registration_link_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customer_registration_link"
    ADD CONSTRAINT "customer_registration_link_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: invoice invoice_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE RESTRICT;


--
-- Name: order order_converted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "order_converted_by_fkey" FOREIGN KEY ("converted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: order order_parent_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order"
    ADD CONSTRAINT "order_parent_order_id_fkey" FOREIGN KEY ("parent_order_id") REFERENCES "public"."order"("id") ON DELETE RESTRICT;


--
-- Name: page page_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: page_section page_section_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page_section"
    ADD CONSTRAINT "page_section_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE CASCADE;


--
-- Name: page page_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: payment payment_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE RESTRICT;


--
-- Name: payment payment_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: profile profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: reseller_application reseller_application_admin_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reseller_application"
    ADD CONSTRAINT "reseller_application_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: product Active products are public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Active products are public" ON "public"."product" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));


--
-- Name: admin_notification_read Admins can manage admin notification reads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage admin notification reads" ON "public"."admin_notification_read" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: admin_role Admins can manage admin roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage admin roles" ON "public"."admin_role" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: analytics_agent_daily Admins can manage agent analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage agent analytics" ON "public"."analytics_agent_daily" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: agent_received_payment Admins can manage agent received payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage agent received payments" ON "public"."agent_received_payment" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: agent Admins can manage agents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage agents" ON "public"."agent" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: contact_inquiry Admins can manage contact inquiries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage contact inquiries" ON "public"."contact_inquiry" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: customer Admins can manage customers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage customers" ON "public"."customer" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: analytics_daily Admins can manage daily analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage daily analytics" ON "public"."analytics_daily" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: invoice Admins can manage invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage invoices" ON "public"."invoice" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: order_item Admins can manage order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage order items" ON "public"."order_item" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: order_status_history Admins can manage order status history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage order status history" ON "public"."order_status_history" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: order Admins can manage orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage orders" ON "public"."order" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: page_section Admins can manage page sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage page sections" ON "public"."page_section" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: page Admins can manage pages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage pages" ON "public"."page" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: payment Admins can manage payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage payments" ON "public"."payment" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: analytics_product_daily Admins can manage product analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage product analytics" ON "public"."analytics_product_daily" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: product Admins can manage products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage products" ON "public"."product" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: profile Admins can manage profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage profiles" ON "public"."profile" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: reseller_application Admins can manage reseller applications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage reseller applications" ON "public"."reseller_application" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: platform_settings Admins can read platform settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can read platform settings" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: platform_settings Admins can update platform settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update platform settings" ON "public"."platform_settings" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));


--
-- Name: order_item Agents can insert own distribution order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can insert own distribution order items" ON "public"."order_item" FOR INSERT TO "authenticated" WITH CHECK ((("order_kind" = 'distribution'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."order" "parent_order"
  WHERE (("parent_order"."id" = "order_item"."order_id") AND ("parent_order"."order_kind" = 'distribution'::"text") AND ("parent_order"."agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")))))));


--
-- Name: order Agents can insert own distribution orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can insert own distribution orders" ON "public"."order" FOR INSERT TO "authenticated" WITH CHECK ((("order_kind" = 'distribution'::"text") AND ("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id"))));


--
-- Name: invoice Agents can read accessible invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read accessible invoices" ON "public"."invoice" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("invoice"."order_id") AS "agent_can_access_order"));


--
-- Name: order_item Agents can read accessible order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read accessible order items" ON "public"."order_item" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("order_item"."order_id") AS "agent_can_access_order"));


--
-- Name: order_status_history Agents can read accessible order status history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read accessible order status history" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("order_status_history"."order_id") AS "agent_can_access_order"));


--
-- Name: order Agents can read accessible orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read accessible orders" ON "public"."order" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("order"."id") AS "agent_can_access_order"));


--
-- Name: payment Agents can read accessible payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read accessible payments" ON "public"."payment" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("payment"."order_id") AS "agent_can_access_order"));


--
-- Name: agent_received_payment Agents can read accessible received payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read accessible received payments" ON "public"."agent_received_payment" FOR SELECT TO "authenticated" USING ((("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")) AND ( SELECT "private"."agent_can_access_order"("agent_received_payment"."order_id") AS "agent_can_access_order")));


--
-- Name: profile Agents can read assigned customer identity profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read assigned customer identity profiles" ON "public"."profile" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customer" "customer_row"
  WHERE (("customer_row"."profile_id" = "profile"."id") AND ("customer_row"."assigned_agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id"))))));


--
-- Name: customer Agents can read assigned customers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read assigned customers" ON "public"."customer" FOR SELECT TO "authenticated" USING (("assigned_agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")));


--
-- Name: customer_registration_link Agents can read assigned registration links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read assigned registration links" ON "public"."customer_registration_link" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customer_registration_link_agent"
  WHERE (("customer_registration_link_agent"."link_id" = "customer_registration_link"."id") AND ("customer_registration_link_agent"."agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id"))))));


--
-- Name: agent Agents can read own agent; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read own agent" ON "public"."agent" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: profile Agents can read own agent identity profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read own agent identity profile" ON "public"."profile" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent" "agent_row"
  WHERE (("agent_row"."profile_id" = "profile"."id") AND ("agent_row"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("agent_row"."status" = 'active'::"text")))));


--
-- Name: analytics_agent_daily Agents can read own commission metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read own commission metrics" ON "public"."analytics_agent_daily" FOR SELECT TO "authenticated" USING (("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")));


--
-- Name: order_item Agents can read own distribution order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read own distribution order items" ON "public"."order_item" FOR SELECT TO "authenticated" USING ((("order_kind" = 'distribution'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."order" "parent_order"
  WHERE (("parent_order"."id" = "order_item"."order_id") AND ("parent_order"."order_kind" = 'distribution'::"text") AND ("parent_order"."agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")))))));


--
-- Name: order Agents can read own distribution orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read own distribution orders" ON "public"."order" FOR SELECT TO "authenticated" USING ((("order_kind" = 'distribution'::"text") AND ("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id"))));


--
-- Name: customer_registration_link_agent Agents can read own registration link notices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can read own registration link notices" ON "public"."customer_registration_link_agent" FOR SELECT TO "authenticated" USING (("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")));


--
-- Name: profile Agents can update own agent identity profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can update own agent identity profile" ON "public"."profile" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent" "agent_row"
  WHERE (("agent_row"."profile_id" = "profile"."id") AND ("agent_row"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("agent_row"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent" "agent_row"
  WHERE (("agent_row"."profile_id" = "profile"."id") AND ("agent_row"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("agent_row"."status" = 'active'::"text")))));


--
-- Name: order_item Agents can update own draft distribution order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can update own draft distribution order items" ON "public"."order_item" FOR UPDATE TO "authenticated" USING ((("order_kind" = 'distribution'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."order" "parent_order"
  WHERE (("parent_order"."id" = "order_item"."order_id") AND ("parent_order"."order_kind" = 'distribution'::"text") AND ("parent_order"."agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")) AND ("parent_order"."order_status" = ANY (ARRAY['pending_customers'::"text", 'pending_order'::"text"]))))))) WITH CHECK ((("order_kind" = 'distribution'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."order" "parent_order"
  WHERE (("parent_order"."id" = "order_item"."order_id") AND ("parent_order"."order_kind" = 'distribution'::"text") AND ("parent_order"."agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")))))));


--
-- Name: order Agents can update own draft distribution orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Agents can update own draft distribution orders" ON "public"."order" FOR UPDATE TO "authenticated" USING ((("order_kind" = 'distribution'::"text") AND ("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")) AND ("order_status" = ANY (ARRAY['pending_customers'::"text", 'pending_order'::"text"])))) WITH CHECK ((("order_kind" = 'distribution'::"text") AND ("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id"))));


--
-- Name: page_section Published page sections are public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Published page sections are public" ON "public"."page_section" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'published'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."page"
  WHERE (("page"."id" = "page_section"."page_id") AND ("page"."status" = 'published'::"text"))))));


--
-- Name: page Published pages are public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Published pages are public" ON "public"."page" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));


--
-- Name: profile Users can read own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own profile" ON "public"."profile" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: profile Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON "public"."profile" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: admin_notification_read; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."admin_notification_read" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_role; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."admin_role" ENABLE ROW LEVEL SECURITY;

--
-- Name: agent; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agent" ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_received_payment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agent_received_payment" ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_agent_daily; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."analytics_agent_daily" ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_daily; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."analytics_daily" ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_product_daily; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."analytics_product_daily" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_inquiry; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."contact_inquiry" ENABLE ROW LEVEL SECURITY;

--
-- Name: customer; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."customer" ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_registration_link; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."customer_registration_link" ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_registration_link_agent; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."customer_registration_link_agent" ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invoice" ENABLE ROW LEVEL SECURITY;

--
-- Name: order; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_item; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_item" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: page; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."page" ENABLE ROW LEVEL SECURITY;

--
-- Name: page_section; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."page_section" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payment" ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: product; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product" ENABLE ROW LEVEL SECURITY;

--
-- Name: profile; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profile" ENABLE ROW LEVEL SECURITY;

--
-- Name: reseller_application; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reseller_application" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "private"; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "agent_can_access_order"("target_order_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

-- Supabase's local bootstrap leaves EXECUTE available through PUBLIC. Revoke
-- that default before replaying this dump's explicit, scoped RPC grants below.
-- Security-definer routines such as submit_guest_order must not become public
-- merely because their historic chain was compacted into this baseline.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "private" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "authenticated";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "private" FROM "anon";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "private" FROM "authenticated";

REVOKE ALL ON FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "block_payment_mutation"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."block_payment_mutation"() FROM PUBLIC;


--
-- Name: FUNCTION "block_referenced_product_delete"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."block_referenced_product_delete"() FROM PUBLIC;


--
-- Name: FUNCTION "calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) TO "service_role";


--
-- Name: FUNCTION "close_paid_customer_order"("target_order_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."close_paid_customer_order"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."close_paid_customer_order"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "close_paid_customer_order_after_payment_status_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."close_paid_customer_order_after_payment_status_change"() FROM PUBLIC;


--
-- Name: FUNCTION "compute_customer_credit_balance"("target_customer_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."compute_customer_credit_balance"("target_customer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."compute_customer_credit_balance"("target_customer_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_customer_with_profile"("p_first_name" "text", "p_last_name" "text", "p_phone_number" "text", "p_email" "text", "p_address" "text", "p_assigned_agent_id" "uuid", "p_is_reseller" boolean, "p_created_by" "uuid", "p_profile_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."create_customer_with_profile"("p_first_name" "text", "p_last_name" "text", "p_phone_number" "text", "p_email" "text", "p_address" "text", "p_assigned_agent_id" "uuid", "p_is_reseller" boolean, "p_created_by" "uuid", "p_profile_id" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "current_agent_profile_id"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."current_agent_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_agent_profile_id"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."current_agent_profile_id"() TO "service_role";


--
-- Name: FUNCTION "derive_invoice_status"("target_order_id" "uuid", "current_status" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") TO "service_role";


--
-- Name: FUNCTION "derive_payment_status"("target_order_id" "uuid", "current_status" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") TO "service_role";


--
-- Name: FUNCTION "generate_customer_tracking_number"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."generate_customer_tracking_number"() FROM PUBLIC;


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "is_agent"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."is_agent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_agent"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_agent"() TO "service_role";


--
-- Name: FUNCTION "is_valid_customer_order_status_transition"("from_status" "text", "to_status" "text"); Type: ACL; Schema: private; Owner: postgres
--

GRANT ALL ON FUNCTION "private"."is_valid_customer_order_status_transition"("from_status" "text", "to_status" "text") TO "service_role";


--
-- Name: FUNCTION "is_valid_distribution_order_status_transition"("from_status" "text", "to_status" "text"); Type: ACL; Schema: private; Owner: postgres
--

GRANT ALL ON FUNCTION "private"."is_valid_distribution_order_status_transition"("from_status" "text", "to_status" "text") TO "service_role";


--
-- Name: FUNCTION "is_valid_invoice_status_transition"("from_status" "text", "to_status" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."is_valid_invoice_status_transition"("from_status" "text", "to_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_valid_invoice_status_transition"("from_status" "text", "to_status" "text") TO "service_role";


--
-- Name: FUNCTION "is_valid_order_status_transition"("from_status" "text", "to_status" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") TO "service_role";


--
-- Name: FUNCTION "record_invoice_status_update"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."record_invoice_status_update"() FROM PUBLIC;


--
-- Name: FUNCTION "record_order_status_history"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."record_order_status_history"() FROM PUBLIC;


--
-- Name: FUNCTION "record_payment_insert"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."record_payment_insert"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_agent_order_after_customer_order_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_agent_order_after_customer_order_change"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_agent_order_status"("target_agent_order_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "refresh_customer_credit_after_limit_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_customer_credit_after_limit_change"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_customer_credit_after_order_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_customer_credit_after_order_change"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_customer_credit_after_order_item_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_customer_credit_after_order_item_change"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_customer_credit_after_payment_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_customer_credit_after_payment_change"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_customer_credit_limit_status"("target_customer_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_customer_credit_limit_status"("target_customer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."refresh_customer_credit_limit_status"("target_customer_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "refresh_order_after_invoice_insert"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_order_after_invoice_insert"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_order_after_item_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_order_after_item_change"() FROM PUBLIC;


--
-- Name: FUNCTION "refresh_order_after_order_status_change"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_order_after_order_status_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."refresh_order_after_order_status_change"() TO "service_role";


--
-- Name: FUNCTION "refresh_order_financial_status"("target_order_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "sync_agent_order_item_commission"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sync_agent_order_item_commission"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_agent_order_status_from_customer_link"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sync_agent_order_status_from_customer_link"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_order_item_final_quantity"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sync_order_item_final_quantity"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_order_item_price_snapshot"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sync_order_item_price_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."sync_order_item_price_snapshot"() TO "service_role";


--
-- Name: FUNCTION "sync_order_sale_date"(); Type: ACL; Schema: private; Owner: postgres
--

GRANT ALL ON FUNCTION "private"."sync_order_sale_date"() TO "service_role";


--
-- Name: FUNCTION "validate_invoice_status_transition"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."validate_invoice_status_transition"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_order_status_transition"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."validate_order_status_transition"() FROM PUBLIC;


--
-- Name: FUNCTION "apply_agent_order_customer_approval"("target_customer_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "apply_customer_payment_distribution"("target_customer_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "recorded_by_value" "uuid", "reference_number_value" "text", "notes_value" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."apply_customer_payment_distribution"("target_customer_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "recorded_by_value" "uuid", "reference_number_value" "text", "notes_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_customer_payment_distribution"("target_customer_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "recorded_by_value" "uuid", "reference_number_value" "text", "notes_value" "text") TO "service_role";


--
-- Name: FUNCTION "assign_invoice_number_from_settings"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."assign_invoice_number_from_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_invoice_number_from_settings"() TO "service_role";


--
-- Name: FUNCTION "attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) TO "authenticated";


--
-- Name: FUNCTION "compute_customer_amount_due"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_customer_amount_due"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_customer_amount_due"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_customer_amount_due"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_earned_commission"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_expected_commission"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_invoice_total"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_order_total"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_payment_balance"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_payment_total"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "confirm_agent_received_payment"("agent_payment_id" "uuid", "recorded_by_value" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."confirm_agent_received_payment"("agent_payment_id" "uuid", "recorded_by_value" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_agent_received_payment"("agent_payment_id" "uuid", "recorded_by_value" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_agent_received_payment"("agent_payment_id" "uuid", "recorded_by_value" "uuid") TO "service_role";


--
-- Name: FUNCTION "convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."convert_customer_order_to_agent_distribution_order"("target_order_id" "uuid") TO "authenticated";


--
-- Name: TABLE "product"; Type: ACL; Schema: public; Owner: postgres
--

-- Supabase's local bootstrap grants broad defaults to API roles. Revoke those
-- defaults before replaying the intentionally scoped table and column grants
-- emitted below; reseller pricing must never be exposed to anonymous users.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "authenticated";

GRANT ALL ON TABLE "public"."product" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."product" TO "anon";
GRANT SELECT("id") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("name") ON TABLE "public"."product" TO "anon";
GRANT SELECT("name") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."category"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("category") ON TABLE "public"."product" TO "anon";
GRANT SELECT("category") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."description"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("description") ON TABLE "public"."product" TO "anon";
GRANT SELECT("description") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."unit_label"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("unit_label") ON TABLE "public"."product" TO "anon";
GRANT SELECT("unit_label") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."default_price"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("default_price") ON TABLE "public"."product" TO "anon";
GRANT SELECT("default_price") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."stock_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("stock_status") ON TABLE "public"."product" TO "anon";
GRANT SELECT("stock_status") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."image_path"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("image_path") ON TABLE "public"."product" TO "anon";
GRANT SELECT("image_path") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."is_active"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("is_active") ON TABLE "public"."product" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."product" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."product" TO "authenticated";


--
-- Name: COLUMN "product"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."product" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."product" TO "authenticated";


--
-- Name: FUNCTION "deactivate_product"("target_product_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") TO "anon";


--
-- Name: FUNCTION "get_customer_orders_by_tracking_number"("p_tracking_number" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_customer_orders_by_tracking_number"("p_tracking_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_orders_by_tracking_number"("p_tracking_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_orders_by_tracking_number"("p_tracking_number" "text") TO "service_role";


--
-- Name: FUNCTION "list_admin_activity_rows"("search_query" "text", "page_number" integer, "page_size" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_admin_activity_rows"("search_query" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_activity_rows"("search_query" "text", "page_number" integer, "page_size" integer) TO "service_role";


--
-- Name: FUNCTION "list_admin_agent_rows"("search_query" "text", "status_filter" "text", "page_number" integer, "page_size" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_admin_agent_rows"("search_query" "text", "status_filter" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_agent_rows"("search_query" "text", "status_filter" "text", "page_number" integer, "page_size" integer) TO "service_role";


--
-- Name: FUNCTION "list_admin_customer_rows"("search_query" "text", "customer_type_filter" "text", "page_number" integer, "page_size" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_admin_customer_rows"("search_query" "text", "customer_type_filter" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_customer_rows"("search_query" "text", "customer_type_filter" "text", "page_number" integer, "page_size" integer) TO "service_role";


--
-- Name: FUNCTION "list_admin_invoice_rows"("search_query" "text", "balance_status_filter" "text", "page_number" integer, "page_size" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_admin_invoice_rows"("search_query" "text", "balance_status_filter" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_invoice_rows"("search_query" "text", "balance_status_filter" "text", "page_number" integer, "page_size" integer) TO "service_role";


--
-- Name: FUNCTION "list_admin_order_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_admin_order_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_order_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer) TO "service_role";


--
-- Name: FUNCTION "list_admin_sales_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_admin_sales_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_sales_rows"("search_query" "text", "source_filter" "text", "order_status_filter" "text", "payment_status_filter" "text", "page_number" integer, "page_size" integer) TO "service_role";


--
-- Name: FUNCTION "submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "submit_agent_received_payment"("target_order_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."submit_agent_received_payment"("target_order_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_agent_received_payment"("target_order_id" "uuid", "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text") TO "service_role";


--
-- Name: FUNCTION "submit_agent_received_payment_distribution"("target_order_ids" "uuid"[], "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."submit_agent_received_payment_distribution"("target_order_ids" "uuid"[], "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_agent_received_payment_distribution"("target_order_ids" "uuid"[], "payment_amount" numeric, "payment_method_value" "text", "payment_terms_value" "text", "payment_date_value" timestamp with time zone, "reference_number_value" "text", "notes_value" "text") TO "service_role";


--
-- Name: FUNCTION "submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "sync_invoice_sequence_from_settings"("target_next" bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_invoice_sequence_from_settings"("target_next" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_invoice_sequence_from_settings"("target_next" bigint) TO "service_role";


--
-- Name: FUNCTION "update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) TO "authenticated";


--
-- Name: TABLE "admin_notification_read"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."admin_notification_read" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."admin_notification_read" TO "authenticated";


--
-- Name: TABLE "admin_role"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."admin_role" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."admin_role" TO "authenticated";


--
-- Name: TABLE "agent"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."agent" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."agent" TO "authenticated";


--
-- Name: TABLE "agent_received_payment"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."agent_received_payment" TO "service_role";
GRANT SELECT ON TABLE "public"."agent_received_payment" TO "authenticated";


--
-- Name: TABLE "analytics_agent_daily"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."analytics_agent_daily" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."analytics_agent_daily" TO "authenticated";


--
-- Name: TABLE "analytics_daily"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."analytics_daily" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."analytics_daily" TO "authenticated";


--
-- Name: TABLE "analytics_product_daily"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."analytics_product_daily" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."analytics_product_daily" TO "authenticated";


--
-- Name: TABLE "contact_inquiry"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."contact_inquiry" TO "service_role";
GRANT SELECT,DELETE,UPDATE ON TABLE "public"."contact_inquiry" TO "authenticated";


--
-- Name: TABLE "customer"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."customer" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customer" TO "authenticated";


--
-- Name: TABLE "customer_registration_link"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."customer_registration_link" TO "service_role";
GRANT SELECT ON TABLE "public"."customer_registration_link" TO "authenticated";


--
-- Name: TABLE "customer_registration_link_agent"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."customer_registration_link_agent" TO "service_role";
GRANT SELECT ON TABLE "public"."customer_registration_link_agent" TO "authenticated";


--
-- Name: TABLE "invoice"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invoice" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."invoice" TO "authenticated";


--
-- Name: SEQUENCE "invoice_number_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";


--
-- Name: TABLE "order"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."order" TO "authenticated";


--
-- Name: TABLE "order_item"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_item" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."order_item" TO "authenticated";


--
-- Name: TABLE "order_status_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."order_status_history" TO "authenticated";


--
-- Name: TABLE "page"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."page" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."page" TO "anon";
GRANT SELECT("id") ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."slug"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("slug") ON TABLE "public"."page" TO "anon";
GRANT SELECT("slug") ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."title"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("title") ON TABLE "public"."page" TO "anon";
GRANT SELECT("title") ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."page" TO "anon";
GRANT SELECT("status") ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."published_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("published_at") ON TABLE "public"."page" TO "anon";
GRANT SELECT("published_at") ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."page" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."page" TO "authenticated";


--
-- Name: COLUMN "page"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."page" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."page" TO "authenticated";


--
-- Name: TABLE "page_section"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."page_section" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("id") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."page_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("page_id") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("page_id") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."type"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("type") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("type") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."sort_order"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("sort_order") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("sort_order") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."content"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("content") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("content") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("status") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: COLUMN "page_section"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."page_section" TO "authenticated";


--
-- Name: TABLE "payment"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."payment" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."payment" TO "authenticated";


--
-- Name: TABLE "platform_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."platform_settings" TO "authenticated";


--
-- Name: TABLE "profile"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profile" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profile" TO "authenticated";


--
-- Name: TABLE "reseller_application"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reseller_application" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."reseller_application" TO "authenticated";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict dVWVf4O6ZDvFS7Jar7POu0ijvpU2wfJlnaqhOcgcGPGCXYXXqz9x8HWZEOSdfhx
