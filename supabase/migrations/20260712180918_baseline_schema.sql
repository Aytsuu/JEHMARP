


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."block_payment_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  raise exception 'Payment records are append-only. Create a new compensating workflow record instead of updating or deleting an existing payment.';
end;
$$;


ALTER FUNCTION "private"."block_payment_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."block_referenced_product_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if exists (
    select 1
    from public.customer_order_item
    where product_id = old.id
  ) then
    raise exception 'Products referenced by order items cannot be deleted. Deactivate the product instead.';
  end if;

  return old;
end;
$$;


ALTER FUNCTION "private"."block_referenced_product_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_agent_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;


ALTER FUNCTION "private"."current_agent_profile_id"() OWNER TO "postgres";


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
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total
    from invoice_row
  )
  select case
    when invoice_total <= 0 then 'paid'
    when payment_total >= invoice_total then 'paid'
    when payment_total > 0 then 'partially_paid'
    when current_status = 'draft' then 'draft'
    else 'issued'
  end
  from totals;
$$;


ALTER FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total
  )
  select case
    when current_status = 'refunded' then 'refunded'
    when invoice_total <= 0 then 'paid'
    when payment_total <= 0 then 'unpaid'
    when payment_total < invoice_total then 'partial'
    else 'paid'
  end
  from totals;
$$;


ALTER FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "private"."is_agent"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select private.current_agent_profile_id()) is not null;
$$;


ALTER FUNCTION "private"."is_agent"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") RETURNS boolean
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


ALTER FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_invoice_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "private"."record_invoice_status_update"() OWNER TO "postgres";


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

  insert into public.customer_order_status_history (
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


CREATE OR REPLACE FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  next_payment_status text;
  next_invoice_status text;
  current_invoice_status text;
begin
  select private.derive_payment_status(target_order_id, customer_order.payment_status)
  into next_payment_status
  from public.customer_order
  where customer_order.id = target_order_id;

  if next_payment_status is not null then
    update public.customer_order
    set payment_status = next_payment_status,
        updated_at = now()
    where id = target_order_id
      and payment_status is distinct from next_payment_status;
  end if;

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


CREATE OR REPLACE FUNCTION "private"."sync_order_item_price_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  order_customer_is_reseller boolean;
  retail_price numeric;
  reseller_price_value numeric;
begin
  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select customer.is_reseller
    into order_customer_is_reseller
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    where customer_order.id = new.order_id;

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

    new.price_type := case
      when order_customer_is_reseller then 'reseller'
      else 'retail'
    end;
    new.unit_price := case
      when order_customer_is_reseller then reseller_price_value
      else retail_price
    end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_order_item_price_snapshot"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "private"."validate_order_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.order_status is distinct from new.order_status
     and not private.is_valid_order_status_transition(old.order_status, new.order_status) then
    raise exception 'Invalid order status transition from % to %.', old.order_status, new.order_status;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."validate_order_status_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_expected_commission(target_order_id), 0) as expected_commission
  )
  select case
    when invoice_total <= 0 then 0::numeric
    else round(expected_commission * least(payment_total / invoice_total, 1), 2)
  end
  from totals;
$$;


ALTER FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(coalesce(sum(agent_commission_amount), 0), 2)
  from public.customer_order_item
  where order_id = target_order_id
    and agent_commission_amount > 0;
$$;


ALTER FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(
    coalesce(sum(customer_order_item.final_quantity * customer_order_item.unit_price), 0),
    2
  )
  from public.customer_order
  left join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
  where customer_order.id = target_order_id
  group by customer_order.id;
$$;


ALTER FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_order_total"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(
    coalesce(sum(customer_order_item.partial_quantity * customer_order_item.unit_price), 0),
    2
  )
  from public.customer_order
  left join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
  where customer_order.id = target_order_id
  group by customer_order.id;
$$;


ALTER FUNCTION "public"."compute_order_total"("target_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") RETURNS numeric
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


ALTER FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select round(coalesce(sum(payment.amount), 0), 2)
  from public.payment
  where payment.order_id = target_order_id;
$$;


ALTER FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    CONSTRAINT "product_category_check" CHECK (("category" = ANY (ARRAY['pork'::"text", 'chicken'::"text", 'egg'::"text"]))),
    CONSTRAINT "product_default_price_check" CHECK (("default_price" >= (0)::numeric)),
    CONSTRAINT "product_reseller_price_check" CHECK (("reseller_price" >= (0)::numeric)),
    CONSTRAINT "product_stock_status_check" CHECK (("stock_status" = ANY (ARRAY['in_stock'::"text", 'limited'::"text", 'out_of_stock'::"text"])))
);


ALTER TABLE "public"."product" OWNER TO "postgres";


COMMENT ON COLUMN "public"."product"."category" IS 'Allowed v1 product category values: pork, chicken, egg.';



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


CREATE OR REPLACE FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_agent_id uuid;
  resolved_customer_id uuid := target_customer_id;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select id
  into current_agent_id
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
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
  elsif not exists (
    select 1
    from public.customer
    where id = resolved_customer_id
      and assigned_agent_id = current_agent_id
  ) then
    raise exception 'Selected customer is not assigned to this agent.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  insert into public.customer_order (
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by
  )
  values (
    resolved_customer_id,
    current_agent_id,
    'agent_submitted',
    'pending',
    'unpaid',
    (select auth.uid())
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
  end loop;

  if not exists (
    select 1
    from public.customer_order_item
    where order_id = inserted_order_id
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Agent order payload contains an invalid product id or quantity.';
end;
$$;


ALTER FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") OWNER TO "postgres";


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

  insert into public.customer (
    first_name,
    last_name,
    phone_number,
    email,
    address
  )
  values (
    trim(customer_payload ->> 'firstName'),
    trim(customer_payload ->> 'lastName'),
    trim(customer_payload ->> 'phoneNumber'),
    nullif(trim(customer_payload ->> 'email'), ''),
    trim(customer_payload ->> 'address')
  )
  returning id into inserted_customer_id;

  insert into public.customer_order (
    customer_id,
    source,
    order_status,
    payment_status
  )
  values (
    inserted_customer_id,
    'guest_shop',
    'pending',
    'unpaid'
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
  end loop;

  if not exists (
    select 1
    from public.customer_order_item
    where order_id = inserted_order_id
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


CREATE TABLE IF NOT EXISTS "public"."agent_profile" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact" "text" NOT NULL,
    CONSTRAINT "agent_profile_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."agent_profile" OWNER TO "postgres";


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


COMMENT ON COLUMN "public"."contact_inquiry"."source_ip" IS 'Request IP captured by the trusted contact inquiry workflow for abuse controls.';



COMMENT ON COLUMN "public"."contact_inquiry"."user_agent" IS 'Request user agent captured by the trusted contact inquiry workflow for abuse review.';



COMMENT ON COLUMN "public"."contact_inquiry"."admin_read_at" IS 'Timestamp when an admin marked this contact inquiry as read.';



COMMENT ON COLUMN "public"."contact_inquiry"."admin_read_by" IS 'Admin user who marked this contact inquiry as read.';



CREATE TABLE IF NOT EXISTS "public"."customer" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "email" "text",
    "address" "text" NOT NULL,
    "assigned_agent_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_reseller" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."customer" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customer"."is_reseller" IS 'When true, new order item price snapshots use product.reseller_price instead of product.default_price.';



CREATE TABLE IF NOT EXISTS "public"."customer_order" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
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
    CONSTRAINT "customer_order_approval_check" CHECK (((("approved_by" IS NULL) AND ("approved_at" IS NULL)) OR (("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "customer_order_order_status_check" CHECK (("order_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'closed'::"text"]))),
    CONSTRAINT "customer_order_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'partial'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "customer_order_source_check" CHECK (("source" = ANY (ARRAY['guest_shop'::"text", 'agent_submitted'::"text", 'admin_manual'::"text"])))
);


ALTER TABLE "public"."customer_order" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customer_order"."admin_read_at" IS 'Timestamp when an admin marked this externally submitted order as read.';



COMMENT ON COLUMN "public"."customer_order"."admin_read_by" IS 'Admin user who marked this externally submitted order as read.';



CREATE TABLE IF NOT EXISTS "public"."customer_order_item" (
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
    "unit_price" numeric(12,2) NOT NULL,
    "price_type" "text" NOT NULL,
    "agent_commission_paid" boolean DEFAULT false NOT NULL,
    CONSTRAINT "customer_order_item_commission_amount_check" CHECK (("agent_commission_amount" >= (0)::numeric)),
    CONSTRAINT "customer_order_item_commission_set_check" CHECK (((("agent_commission_amount" = (0)::numeric) AND ("agent_commission_paid" = false) AND ("agent_commission_set_by" IS NULL) AND ("agent_commission_set_at" IS NULL)) OR ("agent_commission_amount" > (0)::numeric))),
    CONSTRAINT "customer_order_item_final_quantity_check" CHECK (("final_quantity" > (0)::numeric)),
    CONSTRAINT "customer_order_item_partial_quantity_check" CHECK (("partial_quantity" > (0)::numeric)),
    CONSTRAINT "customer_order_item_price_type_check" CHECK (("price_type" = ANY (ARRAY['retail'::"text", 'reseller'::"text"]))),
    CONSTRAINT "customer_order_item_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."customer_order_item" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customer_order_item"."partial_quantity" IS 'Order slip quantity. Used for order reference totals.';



COMMENT ON COLUMN "public"."customer_order_item"."final_quantity" IS 'Sales invoice quantity. Used for final invoice totals, payment balance, and proportional commission calculations.';



COMMENT ON COLUMN "public"."customer_order_item"."unit_price" IS 'Price snapshot used for order and invoice totals. Set from product default or reseller price when the item is created.';



COMMENT ON COLUMN "public"."customer_order_item"."price_type" IS 'Price source for the unit_price snapshot: retail or reseller.';



CREATE TABLE IF NOT EXISTS "public"."customer_order_status_history" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "customer_order_status_history_from_status_check" CHECK ((("from_status" IS NULL) OR ("from_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'closed'::"text"])))),
    CONSTRAINT "customer_order_status_history_to_status_check" CHECK (("to_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."customer_order_status_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "invoice_number" "text" DEFAULT ('INV-'::"text" || "lpad"(("nextval"('"public"."invoice_number_seq"'::"regclass"))::"text", 8, '0'::"text")) NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"(),
    "due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoice_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'partially_paid'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."invoice" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_asset" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "path" "text" NOT NULL,
    "alt_text" "text",
    "media_type" "text" NOT NULL,
    "bucket" "text" DEFAULT 'public'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_asset" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."payment" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "recorded_by" "uuid",
    "reference_number" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile" OWNER TO "postgres";


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


COMMENT ON COLUMN "public"."reseller_application"."source_ip" IS 'Request IP captured by the trusted reseller application workflow for abuse controls.';



COMMENT ON COLUMN "public"."reseller_application"."user_agent" IS 'Request user agent captured by the trusted reseller application workflow for abuse review.';



COMMENT ON COLUMN "public"."reseller_application"."admin_read_at" IS 'Timestamp when an admin marked this reseller application as read.';



COMMENT ON COLUMN "public"."reseller_application"."admin_read_by" IS 'Admin user who marked this reseller application as read.';



ALTER TABLE ONLY "public"."admin_role"
    ADD CONSTRAINT "admin_role_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_role"
    ADD CONSTRAINT "admin_role_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."agent_profile"
    ADD CONSTRAINT "agent_profile_contact_key" UNIQUE ("contact");



ALTER TABLE ONLY "public"."agent_profile"
    ADD CONSTRAINT "agent_profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_profile"
    ADD CONSTRAINT "agent_profile_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."analytics_agent_daily"
    ADD CONSTRAINT "analytics_agent_daily_pkey" PRIMARY KEY ("day", "agent_id");



ALTER TABLE ONLY "public"."analytics_daily"
    ADD CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("day");



ALTER TABLE ONLY "public"."analytics_product_daily"
    ADD CONSTRAINT "analytics_product_daily_pkey" PRIMARY KEY ("day", "product_id");



ALTER TABLE ONLY "public"."contact_inquiry"
    ADD CONSTRAINT "contact_inquiry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_order_item"
    ADD CONSTRAINT "customer_order_item_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_order"
    ADD CONSTRAINT "customer_order_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_order_status_history"
    ADD CONSTRAINT "customer_order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_asset"
    ADD CONSTRAINT "media_asset_path_key" UNIQUE ("path");



ALTER TABLE ONLY "public"."media_asset"
    ADD CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_section"
    ADD CONSTRAINT "page_section_page_id_sort_order_key" UNIQUE ("page_id", "sort_order");



ALTER TABLE ONLY "public"."page_section"
    ADD CONSTRAINT "page_section_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product"
    ADD CONSTRAINT "product_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reseller_application"
    ADD CONSTRAINT "reseller_application_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_profile_contact_idx" ON "public"."agent_profile" USING "btree" ("contact");



CREATE INDEX "analytics_agent_daily_agent_id_idx" ON "public"."analytics_agent_daily" USING "btree" ("agent_id");



CREATE INDEX "analytics_product_daily_product_id_idx" ON "public"."analytics_product_daily" USING "btree" ("product_id");



CREATE INDEX "contact_inquiry_admin_unread_idx" ON "public"."contact_inquiry" USING "btree" ("created_at" DESC) WHERE (("admin_read_at" IS NULL) AND ("inquiry_status" = 'new'::"text"));



CREATE INDEX "contact_inquiry_created_at_idx" ON "public"."contact_inquiry" USING "btree" ("created_at" DESC);



CREATE INDEX "contact_inquiry_email_created_at_idx" ON "public"."contact_inquiry" USING "btree" ("lower"("email"), "created_at" DESC) WHERE ("email" IS NOT NULL);



CREATE INDEX "contact_inquiry_source_ip_created_at_idx" ON "public"."contact_inquiry" USING "btree" ("source_ip", "created_at" DESC) WHERE ("source_ip" IS NOT NULL);



CREATE INDEX "contact_inquiry_status_idx" ON "public"."contact_inquiry" USING "btree" ("inquiry_status");



CREATE INDEX "customer_assigned_agent_id_idx" ON "public"."customer" USING "btree" ("assigned_agent_id");



CREATE INDEX "customer_created_by_idx" ON "public"."customer" USING "btree" ("created_by");



CREATE INDEX "customer_order_admin_unread_idx" ON "public"."customer_order" USING "btree" ("created_at" DESC) WHERE (("admin_read_at" IS NULL) AND ("source" <> 'admin_manual'::"text") AND ("order_status" = 'pending'::"text"));



CREATE INDEX "customer_order_agent_id_idx" ON "public"."customer_order" USING "btree" ("agent_id");



CREATE INDEX "customer_order_created_at_idx" ON "public"."customer_order" USING "btree" ("created_at" DESC);



CREATE INDEX "customer_order_customer_id_idx" ON "public"."customer_order" USING "btree" ("customer_id");



CREATE INDEX "customer_order_item_commission_paid_idx" ON "public"."customer_order_item" USING "btree" ("agent_commission_paid");



CREATE INDEX "customer_order_item_order_id_idx" ON "public"."customer_order_item" USING "btree" ("order_id");



CREATE INDEX "customer_order_item_product_id_idx" ON "public"."customer_order_item" USING "btree" ("product_id");



CREATE INDEX "customer_order_order_status_idx" ON "public"."customer_order" USING "btree" ("order_status");



CREATE INDEX "customer_order_payment_status_idx" ON "public"."customer_order" USING "btree" ("payment_status");



CREATE INDEX "customer_order_source_idx" ON "public"."customer_order" USING "btree" ("source");



CREATE INDEX "customer_order_status_history_changed_at_idx" ON "public"."customer_order_status_history" USING "btree" ("changed_at" DESC);



CREATE INDEX "customer_order_status_history_order_id_idx" ON "public"."customer_order_status_history" USING "btree" ("order_id");



CREATE INDEX "invoice_status_idx" ON "public"."invoice" USING "btree" ("status");



CREATE INDEX "media_asset_bucket_idx" ON "public"."media_asset" USING "btree" ("bucket");



CREATE INDEX "page_section_page_id_sort_order_idx" ON "public"."page_section" USING "btree" ("page_id", "sort_order");



CREATE INDEX "page_section_page_id_status_idx" ON "public"."page_section" USING "btree" ("page_id", "status");



CREATE INDEX "page_status_idx" ON "public"."page" USING "btree" ("status");



CREATE INDEX "payment_order_id_idx" ON "public"."payment" USING "btree" ("order_id");



CREATE INDEX "payment_payment_date_idx" ON "public"."payment" USING "btree" ("payment_date" DESC);



CREATE INDEX "product_category_idx" ON "public"."product" USING "btree" ("category");



CREATE INDEX "product_is_active_idx" ON "public"."product" USING "btree" ("is_active");



CREATE INDEX "product_stock_status_idx" ON "public"."product" USING "btree" ("stock_status");



CREATE INDEX "reseller_application_admin_unread_idx" ON "public"."reseller_application" USING "btree" ("created_at" DESC) WHERE (("admin_read_at" IS NULL) AND ("application_status" = 'submitted'::"text"));



CREATE INDEX "reseller_application_created_at_idx" ON "public"."reseller_application" USING "btree" ("created_at" DESC);



CREATE INDEX "reseller_application_email_created_at_idx" ON "public"."reseller_application" USING "btree" ("lower"("email"), "created_at" DESC);



CREATE INDEX "reseller_application_email_delivery_status_idx" ON "public"."reseller_application" USING "btree" ("email_delivery_status");



CREATE INDEX "reseller_application_source_ip_created_at_idx" ON "public"."reseller_application" USING "btree" ("source_ip", "created_at" DESC) WHERE ("source_ip" IS NOT NULL);



CREATE INDEX "reseller_application_status_idx" ON "public"."reseller_application" USING "btree" ("application_status");



CREATE OR REPLACE TRIGGER "block_payment_mutation" BEFORE DELETE OR UPDATE ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "private"."block_payment_mutation"();



CREATE OR REPLACE TRIGGER "block_referenced_product_delete" BEFORE DELETE ON "public"."product" FOR EACH ROW EXECUTE FUNCTION "private"."block_referenced_product_delete"();



CREATE OR REPLACE TRIGGER "record_invoice_status_update" AFTER UPDATE OF "status" ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "private"."record_invoice_status_update"();



CREATE OR REPLACE TRIGGER "record_order_status_history" AFTER INSERT OR UPDATE OF "order_status" ON "public"."customer_order" FOR EACH ROW EXECUTE FUNCTION "private"."record_order_status_history"();



CREATE OR REPLACE TRIGGER "record_payment_insert" AFTER INSERT ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "private"."record_payment_insert"();



CREATE OR REPLACE TRIGGER "refresh_order_after_invoice_insert" AFTER INSERT ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_order_after_invoice_insert"();



CREATE OR REPLACE TRIGGER "refresh_order_after_item_change" AFTER INSERT OR DELETE OR UPDATE OF "final_quantity", "partial_quantity", "product_id", "unit_price", "price_type", "agent_commission_amount" ON "public"."customer_order_item" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_order_after_item_change"();



CREATE OR REPLACE TRIGGER "refresh_order_after_order_status_change" AFTER UPDATE OF "order_status" ON "public"."customer_order" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_order_after_order_status_change"();



CREATE OR REPLACE TRIGGER "sync_order_item_final_quantity" BEFORE INSERT OR UPDATE OF "partial_quantity" ON "public"."customer_order_item" FOR EACH ROW EXECUTE FUNCTION "private"."sync_order_item_final_quantity"();



CREATE OR REPLACE TRIGGER "sync_order_item_price_snapshot" BEFORE INSERT OR UPDATE OF "product_id" ON "public"."customer_order_item" FOR EACH ROW EXECUTE FUNCTION "private"."sync_order_item_price_snapshot"();



CREATE OR REPLACE TRIGGER "validate_invoice_status_transition" BEFORE UPDATE OF "status" ON "public"."invoice" FOR EACH ROW EXECUTE FUNCTION "private"."validate_invoice_status_transition"();



CREATE OR REPLACE TRIGGER "validate_order_status_transition" BEFORE UPDATE OF "order_status" ON "public"."customer_order" FOR EACH ROW EXECUTE FUNCTION "private"."validate_order_status_transition"();



ALTER TABLE ONLY "public"."admin_role"
    ADD CONSTRAINT "admin_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_profile"
    ADD CONSTRAINT "agent_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_agent_daily"
    ADD CONSTRAINT "analytics_agent_daily_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profile"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_product_daily"
    ADD CONSTRAINT "analytics_product_daily_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_inquiry"
    ADD CONSTRAINT "contact_inquiry_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agent_profile"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer"
    ADD CONSTRAINT "customer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_order"
    ADD CONSTRAINT "customer_order_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_order"
    ADD CONSTRAINT "customer_order_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profile"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_order"
    ADD CONSTRAINT "customer_order_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_order"
    ADD CONSTRAINT "customer_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_order_item"
    ADD CONSTRAINT "customer_order_item_agent_commission_set_by_fkey" FOREIGN KEY ("agent_commission_set_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_order_item"
    ADD CONSTRAINT "customer_order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_order"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_order_item"
    ADD CONSTRAINT "customer_order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_order_status_history"
    ADD CONSTRAINT "customer_order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_order_status_history"
    ADD CONSTRAINT "customer_order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_order"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_order"
    ADD CONSTRAINT "customer_order_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice"
    ADD CONSTRAINT "invoice_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_order"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."media_asset"
    ADD CONSTRAINT "media_asset_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_section"
    ADD CONSTRAINT "page_section_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_order"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reseller_application"
    ADD CONSTRAINT "reseller_application_admin_read_by_fkey" FOREIGN KEY ("admin_read_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Active products are public" ON "public"."product" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Admins can manage admin roles" ON "public"."admin_role" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage agent analytics" ON "public"."analytics_agent_daily" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage agent profiles" ON "public"."agent_profile" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage contact inquiries" ON "public"."contact_inquiry" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage customers" ON "public"."customer" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage daily analytics" ON "public"."analytics_daily" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage invoices" ON "public"."invoice" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage media assets" ON "public"."media_asset" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage order items" ON "public"."customer_order_item" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage order status history" ON "public"."customer_order_status_history" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage orders" ON "public"."customer_order" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage page sections" ON "public"."page_section" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage pages" ON "public"."page" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage payments" ON "public"."payment" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage product analytics" ON "public"."analytics_product_daily" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage products" ON "public"."product" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage profiles" ON "public"."profile" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins can manage reseller applications" ON "public"."reseller_application" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Agents can read accessible invoices" ON "public"."invoice" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("invoice"."order_id") AS "agent_can_access_order"));



CREATE POLICY "Agents can read accessible order items" ON "public"."customer_order_item" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("customer_order_item"."order_id") AS "agent_can_access_order"));



CREATE POLICY "Agents can read accessible order status history" ON "public"."customer_order_status_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("customer_order_status_history"."order_id") AS "agent_can_access_order"));



CREATE POLICY "Agents can read accessible orders" ON "public"."customer_order" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("customer_order"."id") AS "agent_can_access_order"));



CREATE POLICY "Agents can read accessible payments" ON "public"."payment" FOR SELECT TO "authenticated" USING (( SELECT "private"."agent_can_access_order"("payment"."order_id") AS "agent_can_access_order"));



CREATE POLICY "Agents can read assigned customers" ON "public"."customer" FOR SELECT TO "authenticated" USING (("assigned_agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")));



CREATE POLICY "Agents can read own agent profile" ON "public"."agent_profile" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Agents can read own commission metrics" ON "public"."analytics_agent_daily" FOR SELECT TO "authenticated" USING (("agent_id" = ( SELECT "private"."current_agent_profile_id"() AS "current_agent_profile_id")));



CREATE POLICY "Published page sections are public" ON "public"."page_section" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'published'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."page"
  WHERE (("page"."id" = "page_section"."page_id") AND ("page"."status" = 'published'::"text"))))));



CREATE POLICY "Published pages are public" ON "public"."page" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "Users can read own profile" ON "public"."profile" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own profile" ON "public"."profile" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."admin_role" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_agent_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_product_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_inquiry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_order" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_order_item" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_asset" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_section" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reseller_application" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."agent_can_access_order"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."block_payment_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."block_referenced_product_delete"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."current_agent_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_agent_profile_id"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."current_agent_profile_id"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."derive_invoice_status"("target_order_id" "uuid", "current_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."derive_payment_status"("target_order_id" "uuid", "current_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_agent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_agent"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_agent"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_valid_invoice_status_transition"("from_status" "text", "to_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_valid_invoice_status_transition"("from_status" "text", "to_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_valid_order_status_transition"("from_status" "text", "to_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."record_invoice_status_update"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_order_status_history"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_payment_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_order_after_invoice_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_order_after_item_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_order_after_order_status_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."refresh_order_after_order_status_change"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."refresh_order_financial_status"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."sync_order_item_final_quantity"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_order_item_price_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."sync_order_item_price_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."validate_invoice_status_transition"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."validate_order_status_transition"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_earned_commission"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_expected_commission"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_invoice_total"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_order_total"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_payment_balance"("target_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_payment_total"("target_order_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."product" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."product" TO "anon";
GRANT SELECT("id") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("name") ON TABLE "public"."product" TO "anon";
GRANT SELECT("name") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("category") ON TABLE "public"."product" TO "anon";
GRANT SELECT("category") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("description") ON TABLE "public"."product" TO "anon";
GRANT SELECT("description") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("unit_label") ON TABLE "public"."product" TO "anon";
GRANT SELECT("unit_label") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("default_price") ON TABLE "public"."product" TO "anon";
GRANT SELECT("default_price") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("stock_status") ON TABLE "public"."product" TO "anon";
GRANT SELECT("stock_status") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("image_path") ON TABLE "public"."product" TO "anon";
GRANT SELECT("image_path") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("is_active") ON TABLE "public"."product" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."product" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."product" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."product" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."product" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_product"("target_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_guest_order"("customer_payload" "jsonb", "item_payload" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."admin_role" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."admin_role" TO "authenticated";



GRANT ALL ON TABLE "public"."agent_profile" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."agent_profile" TO "authenticated";



GRANT ALL ON TABLE "public"."analytics_agent_daily" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."analytics_agent_daily" TO "authenticated";



GRANT ALL ON TABLE "public"."analytics_daily" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."analytics_daily" TO "authenticated";



GRANT ALL ON TABLE "public"."analytics_product_daily" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."analytics_product_daily" TO "authenticated";



GRANT ALL ON TABLE "public"."contact_inquiry" TO "service_role";
GRANT SELECT,DELETE,UPDATE ON TABLE "public"."contact_inquiry" TO "authenticated";



GRANT ALL ON TABLE "public"."customer" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customer" TO "authenticated";



GRANT ALL ON TABLE "public"."customer_order" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customer_order" TO "authenticated";



GRANT ALL ON TABLE "public"."customer_order_item" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customer_order_item" TO "authenticated";



GRANT ALL ON TABLE "public"."customer_order_status_history" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customer_order_status_history" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."invoice" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."invoice" TO "authenticated";



GRANT ALL ON TABLE "public"."media_asset" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."media_asset" TO "authenticated";



GRANT ALL ON TABLE "public"."page" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."page" TO "anon";
GRANT SELECT("id") ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("slug") ON TABLE "public"."page" TO "anon";
GRANT SELECT("slug") ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("title") ON TABLE "public"."page" TO "anon";
GRANT SELECT("title") ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."page" TO "anon";
GRANT SELECT("status") ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("published_at") ON TABLE "public"."page" TO "anon";
GRANT SELECT("published_at") ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."page" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."page" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."page" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."page" TO "authenticated";



GRANT ALL ON TABLE "public"."page_section" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("id") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("page_id") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("page_id") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("type") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("type") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("sort_order") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("sort_order") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("content") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("content") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("status") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."page_section" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."page_section" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."page_section" TO "authenticated";



GRANT ALL ON TABLE "public"."payment" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."payment" TO "authenticated";



GRANT ALL ON TABLE "public"."profile" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profile" TO "authenticated";



GRANT ALL ON TABLE "public"."reseller_application" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."reseller_application" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";





INSERT INTO "storage"."buckets" ("id", "name", "public")
VALUES ('product-images', 'product-images', true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "public" = EXCLUDED."public";


