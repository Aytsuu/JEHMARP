alter table "public"."payment"
  add column if not exists "payment_terms" text;

alter table "public"."agent_received_payment"
  add column if not exists "payment_terms" text;

alter table "public"."payment"
  disable trigger "block_payment_mutation";

update "public"."payment"
set "payment_terms" = case
  when lower(trim("payment_method")) in ('gcash', 'g cash') then 'Gcash'
  when lower(trim("payment_method")) like '%bank%' then 'Bank Transfer'
  else 'Cash on Delivery (COD)'
end
where "payment_terms" is null;

update "public"."payment"
set "payment_method" = case
  when lower(trim("payment_method")) like '%check%' then 'Check'
  else 'Cash'
end
where "payment_method" not in ('Cash', 'Check');

alter table "public"."payment"
  enable trigger "block_payment_mutation";

update "public"."agent_received_payment"
set "payment_terms" = case
  when lower(trim("payment_method")) in ('gcash', 'g cash') then 'Gcash'
  when lower(trim("payment_method")) like '%bank%' then 'Bank Transfer'
  else 'Cash on Delivery (COD)'
end
where "payment_terms" is null;

update "public"."agent_received_payment"
set "payment_method" = case
  when lower(trim("payment_method")) like '%check%' then 'Check'
  else 'Cash'
end
where "payment_method" not in ('Cash', 'Check');

alter table "public"."payment"
  alter column "payment_terms" set not null;

alter table "public"."agent_received_payment"
  alter column "payment_terms" set not null;

alter table "public"."payment"
  add constraint "payment_payment_method_check"
  check ("payment_method" in ('Cash', 'Check')) not valid;

alter table "public"."payment"
  add constraint "payment_payment_terms_check"
  check ("payment_terms" in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash')) not valid;

alter table "public"."agent_received_payment"
  add constraint "agent_received_payment_method_check"
  check ("payment_method" in ('Cash', 'Check')) not valid;

alter table "public"."agent_received_payment"
  add constraint "agent_received_payment_terms_check"
  check ("payment_terms" in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash')) not valid;

alter table "public"."payment" validate constraint "payment_payment_method_check";
alter table "public"."payment" validate constraint "payment_payment_terms_check";
alter table "public"."agent_received_payment" validate constraint "agent_received_payment_method_check";
alter table "public"."agent_received_payment" validate constraint "agent_received_payment_terms_check";

create or replace function "public"."apply_customer_payment_distribution"(
  "target_customer_id" "uuid",
  "payment_amount" numeric,
  "payment_method_value" "text",
  "payment_terms_value" "text",
  "payment_date_value" "date",
  "recorded_by_value" "uuid",
  "reference_number_value" "text" default null::"text",
  "notes_value" "text" default null::"text"
) returns "jsonb"
language "plpgsql"
security definer
set "search_path" to ''
as $$
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
  from public.customer_order
  where customer_order.customer_id = target_customer_id
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
    from public.customer_order
    where customer_order.customer_id = target_customer_id
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

alter function "public"."apply_customer_payment_distribution"(
  "uuid",
  numeric,
  "text",
  "text",
  "date",
  "uuid",
  "text",
  "text"
) owner to "postgres";

revoke all on function "public"."apply_customer_payment_distribution"(
  "uuid",
  numeric,
  "text",
  "text",
  "date",
  "uuid",
  "text",
  "text"
) from public;
revoke all on function "public"."apply_customer_payment_distribution"(
  "uuid",
  numeric,
  "text",
  "text",
  "date",
  "uuid",
  "text",
  "text"
) from anon;
revoke all on function "public"."apply_customer_payment_distribution"(
  "uuid",
  numeric,
  "text",
  "text",
  "date",
  "uuid",
  "text",
  "text"
) from authenticated;
grant execute on function "public"."apply_customer_payment_distribution"(
  "uuid",
  numeric,
  "text",
  "text",
  "date",
  "uuid",
  "text",
  "text"
) to service_role;

create or replace function "public"."submit_agent_received_payment"(
  "target_order_id" uuid,
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_terms_value" text,
  "payment_date_value" date,
  "reference_number_value" text default null,
  "notes_value" text default null
) returns uuid
language "plpgsql"
security definer
set "search_path" to ''
as $$
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
  from public.agent_profile
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

alter function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  text,
  date,
  text,
  text
) owner to "postgres";

revoke all on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  text,
  date,
  text,
  text
) from public;
revoke execute on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  text,
  date,
  text,
  text
) from anon;
grant execute on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  text,
  date,
  text,
  text
) to authenticated;

create or replace function "public"."submit_agent_received_payment_distribution"(
  "target_order_ids" uuid[],
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_terms_value" text,
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

alter function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  text,
  date,
  text,
  text
) owner to "postgres";

revoke all on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  text,
  date,
  text,
  text
) from public;
revoke execute on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  text,
  date,
  text,
  text
) from anon;
grant execute on function "public"."submit_agent_received_payment_distribution"(
  uuid[],
  numeric,
  text,
  text,
  date,
  text,
  text
) to authenticated;

create or replace function "public"."confirm_agent_received_payment"(
  "agent_payment_id" uuid,
  "recorded_by_value" uuid
) returns uuid
language "plpgsql"
security definer
set "search_path" to ''
as $$
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
    (select auth.uid()),
    pending_payment.reference_number,
    pending_payment.notes
  )
  returning id into inserted_payment_id;

  update public.agent_received_payment
  set status = 'confirmed',
      confirmed_payment_id = inserted_payment_id,
      confirmed_by = (select auth.uid()),
      confirmed_at = now(),
      updated_at = now()
  where id = pending_payment.id;

  return inserted_payment_id;
end;
$$;

alter function "public"."confirm_agent_received_payment"(uuid, uuid) owner to "postgres";
