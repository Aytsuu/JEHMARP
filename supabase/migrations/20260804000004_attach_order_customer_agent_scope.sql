-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260804000004_attach_order_customer_agent_scope.sql

-- Scope attach-order customer pickers to the distribution agent (plus unassigned customers)
-- and auto-assign unassigned customers when attached to a distribution order.

create or replace function public.attach_customer_to_agent_order(
  target_agent_order_id uuid,
  target_customer_id uuid,
  item_payload jsonb,
  customer_payload jsonb default null,
  require_approval boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
    current_agent_customer_id := null;
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
  else
    if not exists (
      select 1
      from public.customer
      where id = resolved_customer_id
    ) then
      raise exception 'Selected customer was not found.';
    end if;

    if exists (
      select 1
      from public.customer
      where id = resolved_customer_id
        and assigned_agent_id is not null
        and assigned_agent_id <> current_agent_id
        and id is distinct from current_agent_customer_id
    ) then
      raise exception 'Selected customer is assigned to another agent.';
    end if;

    update public.customer
    set assigned_agent_id = current_agent_id,
        updated_at = now()
    where id = resolved_customer_id
      and assigned_agent_id is null;
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

alter function public.attach_customer_to_agent_order(uuid, uuid, jsonb, jsonb, boolean) owner to postgres;

revoke all on function public.attach_customer_to_agent_order(uuid, uuid, jsonb, jsonb, boolean) from public;
grant execute on function public.attach_customer_to_agent_order(uuid, uuid, jsonb, jsonb, boolean) to service_role;
grant execute on function public.attach_customer_to_agent_order(uuid, uuid, jsonb, jsonb, boolean) to authenticated;
