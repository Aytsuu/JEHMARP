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
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if resolved_customer_id is null and customer_payload is null then
    insert into public.agent_order (
      agent_id,
      order_status,
      submitted_by
    )
    values (
      current_agent_id,
      'pending_customers',
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

        update public.agent_profile
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
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Agent order payload contains an invalid product id or quantity.';
end;
$$;

alter function "public"."submit_agent_order"("uuid", "jsonb", "jsonb") owner to "postgres";

revoke all on function "public"."submit_agent_order"("uuid", "jsonb", "jsonb") from public;
revoke execute on function "public"."submit_agent_order"("uuid", "jsonb", "jsonb") from anon;
revoke execute on function "public"."submit_agent_order"("uuid", "jsonb", "jsonb") from authenticated;
grant execute on function "public"."submit_agent_order"("uuid", "jsonb", "jsonb") to authenticated;
grant execute on function "public"."submit_agent_order"("uuid", "jsonb", "jsonb") to service_role;
