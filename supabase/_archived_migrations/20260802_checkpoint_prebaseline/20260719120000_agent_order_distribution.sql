alter table "public"."customer_order_item"
  add column if not exists "agent_order_quantity_increase" numeric(12,3) default 0 not null;

alter table "public"."customer_order_item"
  add constraint "customer_order_item_agent_order_quantity_increase_check"
  check (("agent_order_quantity_increase" >= (0)::numeric));

create or replace function "private"."agent_order_approved_distributed_quantity"(
  "target_agent_order_id" "uuid",
  "target_product_id" "uuid"
) returns numeric
  language "sql"
  stable
  set "search_path" to ''
  as $$
  select coalesce(sum(customer_order_item.partial_quantity), 0)
  from public.customer_order
  join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
  where customer_order.agent_order_id = target_agent_order_id
    and customer_order.order_status <> 'pending'
    and customer_order_item.product_id = target_product_id;
$$;

alter function "private"."agent_order_approved_distributed_quantity"("target_agent_order_id" "uuid", "target_product_id" "uuid") owner to "postgres";

create or replace function "private"."agent_order_item_is_fully_paid"(
  "target_agent_order_id" "uuid"
) returns boolean
  language "sql"
  stable
  set "search_path" to ''
  as $$
  select exists (
    select 1
    from public.customer_order
    where customer_order.agent_order_id = target_agent_order_id
  )
  and not exists (
    select 1
    from public.customer_order
    where customer_order.agent_order_id = target_agent_order_id
      and customer_order.payment_status <> 'paid'
  );
$$;

alter function "private"."agent_order_item_is_fully_paid"("target_agent_order_id" "uuid") owner to "postgres";

create or replace function "public"."update_agent_order_item_quantity"(
  "target_agent_order_item_id" "uuid",
  "new_quantity" numeric
) returns "uuid"
  language "plpgsql"
  security definer
  set "search_path" to ''
  as $$
declare
  current_item record;
  approved_distributed numeric;
  remaining_quantity numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to update agent order quantity.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can update agent order item quantity.';
  end if;

  select
    agent_order_item.id,
    agent_order_item.agent_order_id,
    agent_order_item.product_id,
    agent_order_item.quantity
  into current_item
  from public.agent_order_item
  where agent_order_item.id = target_agent_order_item_id
  limit 1;

  if current_item.id is null then
    raise exception 'Agent order item was not found.';
  end if;

  if private.agent_order_item_is_fully_paid(current_item.agent_order_id) then
    raise exception 'Agent order quantity cannot be edited after all customer orders are fully paid.';
  end if;

  if new_quantity is null or new_quantity <= 0 then
    raise exception 'Agent order item quantity must be greater than zero.';
  end if;

  if new_quantity >= current_item.quantity then
    raise exception 'Agent order item quantity can only be decreased.';
  end if;

  approved_distributed := private.agent_order_approved_distributed_quantity(
    current_item.agent_order_id,
    current_item.product_id
  );
  remaining_quantity := greatest(current_item.quantity - approved_distributed, 0);

  if current_item.quantity - new_quantity > remaining_quantity then
    raise exception 'Cannot decrease quantity below distributed customer allocations.';
  end if;

  if new_quantity < approved_distributed then
    raise exception 'Cannot decrease quantity below distributed customer allocations.';
  end if;

  update public.agent_order_item
  set quantity = new_quantity,
      updated_at = now()
  where id = current_item.id;

  return current_item.id;
end;
$$;

alter function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) owner to "postgres";

create or replace function "private"."apply_agent_order_item_quantity_increase"(
  "target_agent_order_id" "uuid",
  "target_product_id" "uuid",
  "quantity_increase" numeric,
  "item_details" text
) returns void
  language "plpgsql"
  set "search_path" to ''
  as $$
declare
  existing_item_id uuid;
begin
  if quantity_increase is null or quantity_increase <= 0 then
    return;
  end if;

  select id
  into existing_item_id
  from public.agent_order_item
  where agent_order_id = target_agent_order_id
    and product_id = target_product_id
  limit 1;

  if existing_item_id is null then
    insert into public.agent_order_item (
      agent_order_id,
      product_id,
      quantity,
      add_details
    )
    values (
      target_agent_order_id,
      target_product_id,
      quantity_increase,
      item_details
    );
    return;
  end if;

  update public.agent_order_item
  set quantity = quantity + quantity_increase,
      updated_at = now()
  where id = existing_item_id;
end;
$$;

alter function "private"."apply_agent_order_item_quantity_increase"("target_agent_order_id" "uuid", "target_product_id" "uuid", "quantity_increase" numeric, "item_details" text) owner to "postgres";

create or replace function "public"."apply_agent_order_customer_approval"(
  "target_customer_order_id" "uuid"
) returns "uuid"
  language "plpgsql"
  security definer
  set "search_path" to ''
  as $$
declare
  current_order record;
  item record;
begin
  select
    customer_order.id,
    customer_order.agent_order_id,
    customer_order.order_status
  into current_order
  from public.customer_order
  where customer_order.id = target_customer_order_id
  limit 1;

  if current_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if current_order.agent_order_id is null then
    return current_order.id;
  end if;

  if current_order.order_status <> 'processing' then
    return current_order.id;
  end if;

  for item in
    select
      customer_order_item.product_id,
      customer_order_item.agent_order_quantity_increase,
      customer_order_item.add_details
    from public.customer_order_item
    where customer_order_item.order_id = current_order.id
      and customer_order_item.agent_order_quantity_increase > 0
  loop
    perform private.apply_agent_order_item_quantity_increase(
      current_order.agent_order_id,
      item.product_id,
      item.agent_order_quantity_increase,
      item.add_details
    );
  end loop;

  update public.customer_order_item
  set agent_order_quantity_increase = 0
  where order_id = current_order.id
    and agent_order_quantity_increase > 0;

  return current_order.id;
end;
$$;

alter function "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") owner to "postgres";

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

  select agent_id
  into agent_order_agent_id
  from public.agent_order
  where id = target_agent_order_id
  limit 1;

  if agent_order_agent_id is null then
    raise exception 'Agent order was not found.';
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
    from public.agent_profile
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

alter function "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) owner to "postgres";

create or replace function "private"."apply_agent_order_customer_approval_on_status_change"() returns "trigger"
  language "plpgsql"
  set "search_path" to ''
  as $$
begin
  if tg_op = 'UPDATE'
     and old.order_status = 'pending'
     and new.order_status = 'processing'
     and new.agent_order_id is not null then
    perform public.apply_agent_order_customer_approval(new.id);
  end if;

  return new;
end;
$$;

alter function "private"."apply_agent_order_customer_approval_on_status_change"() owner to "postgres";

drop trigger if exists "apply_agent_order_customer_approval_on_status_change" on "public"."customer_order";

create trigger "apply_agent_order_customer_approval_on_status_change"
  after update of "order_status" on "public"."customer_order"
  for each row
  execute function "private"."apply_agent_order_customer_approval_on_status_change"();

revoke all on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) from public;
revoke execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) from anon;
revoke execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) from authenticated;
grant execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) to authenticated;
grant execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) to service_role;

revoke all on function "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") from public;
revoke execute on function "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") from anon;
revoke execute on function "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") from authenticated;
grant execute on function "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") to authenticated;
grant execute on function "public"."apply_agent_order_customer_approval"("target_customer_order_id" "uuid") to service_role;

revoke all on function "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) from public;
revoke execute on function "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) from anon;
revoke execute on function "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) from authenticated;
grant execute on function "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) to authenticated;
grant execute on function "public"."attach_customer_to_agent_order"("target_agent_order_id" "uuid", "target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb", "require_approval" boolean) to service_role;
