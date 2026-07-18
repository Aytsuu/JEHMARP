create or replace function "public"."submit_agent_received_payment_distribution"(
  "target_order_ids" uuid[],
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_date_value" date,
  "reference_number_value" text default null,
  "notes_value" text default null
) returns uuid[]
language "plpgsql"
security definer
set "search_path" to ''
as $$
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
  from public.agent_profile
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

  if nullif(trim(payment_method_value), '') is null then
    raise exception 'Payment method is required.';
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
      payment_date,
      reference_number,
      notes,
      received_by
    )
    values (
      order_record.order_id,
      current_agent_id,
      amount_to_record,
      trim(payment_method_value),
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

alter function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  date,
  text,
  text
) owner to "postgres";

revoke all on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  date,
  text,
  text
) from public;

revoke execute on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  date,
  text,
  text
) from anon;

grant execute on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  date,
  text,
  text
) to authenticated;

grant execute on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  date,
  text,
  text
) to service_role;
