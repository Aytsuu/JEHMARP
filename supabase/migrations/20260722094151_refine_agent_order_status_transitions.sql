create or replace function public.submit_agent_order(
  target_customer_id uuid,
  item_payload jsonb,
  customer_payload jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    insert into public.agent_order (
      agent_id,
      order_status,
      release_date,
      submitted_by
    )
    values (
      current_agent_id,
      'pending_order',
      requested_release_date,
      (select auth.uid())
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

  if inserted_order_id is null and inserted_agent_order_id is null then
    raise exception 'At least one valid order item is required.';
  end if;

  return coalesce(inserted_order_id, inserted_agent_order_id);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Agent order payload contains an invalid product id, quantity, or release date.';
end;
$$;

create or replace function private.refresh_agent_order_status(target_agent_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.agent_order
  set order_status = 'processing',
      updated_at = now()
  where id = target_agent_order_id
    and order_status = 'pending_customers'
    and exists (
      select 1
      from public.customer_order
      where customer_order.agent_order_id = target_agent_order_id
    );

  update public.agent_order
  set order_status = 'closed',
      updated_at = now()
  where id = target_agent_order_id
    and order_status is distinct from 'closed'
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
    );
end;
$$;

alter function public.submit_agent_order(uuid, jsonb, jsonb) owner to postgres;
alter function private.refresh_agent_order_status(uuid) owner to postgres;

update public.agent_order
set order_status = 'pending_order',
    updated_at = now()
where order_status = 'pending_customers'
  and admin_read_at is null
  and not exists (
    select 1
    from public.customer_order
    where customer_order.agent_order_id = agent_order.id
  );

create or replace function private.block_pending_agent_order_customer_link() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.agent_order_id is not null
    and exists (
      select 1
      from public.agent_order
      where agent_order.id = new.agent_order_id
        and agent_order.order_status = 'pending_order'
    ) then
    raise exception 'Agent order must be approved before customer orders can be attached.';
  end if;

  return new;
end;
$$;

alter function private.block_pending_agent_order_customer_link() owner to postgres;

drop trigger if exists "block_pending_agent_order_customer_link" on "public"."customer_order";

create trigger "block_pending_agent_order_customer_link"
  before insert or update of "agent_order_id" on "public"."customer_order"
  for each row
  execute function "private"."block_pending_agent_order_customer_link"();
