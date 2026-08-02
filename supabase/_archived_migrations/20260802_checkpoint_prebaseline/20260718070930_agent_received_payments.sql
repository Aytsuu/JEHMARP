create table if not exists "public"."agent_received_payment" (
  "id" uuid default "extensions"."gen_random_uuid"() not null,
  "order_id" uuid not null,
  "agent_id" uuid not null,
  "amount" numeric(12,2) not null,
  "payment_method" text not null,
  "payment_date" date default current_date not null,
  "reference_number" text,
  "notes" text,
  "status" text default 'pending_admin_confirmation'::text not null,
  "received_by" uuid,
  "confirmed_payment_id" uuid,
  "confirmed_by" uuid,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone default "now"() not null,
  "updated_at" timestamp with time zone default "now"() not null,
  constraint "agent_received_payment_pkey" primary key ("id"),
  constraint "agent_received_payment_amount_check" check (("amount" > (0)::numeric)),
  constraint "agent_received_payment_status_check" check (
    "status" = any (
      array[
        'pending_admin_confirmation'::text,
        'confirmed'::text,
        'rejected'::text
      ]
    )
  ),
  constraint "agent_received_payment_confirmed_state_check" check (
    (
      "status" = 'confirmed'
      and "confirmed_payment_id" is not null
      and "confirmed_by" is not null
      and "confirmed_at" is not null
    )
    or (
      "status" <> 'confirmed'
      and "confirmed_payment_id" is null
    )
  )
);

alter table "public"."agent_received_payment" owner to "postgres";

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_received_payment_order_id_fkey'
      and conrelid = 'public.agent_received_payment'::regclass
  ) then
    alter table "public"."agent_received_payment"
      add constraint "agent_received_payment_order_id_fkey"
      foreign key ("order_id") references "public"."customer_order"("id")
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_received_payment_agent_id_fkey'
      and conrelid = 'public.agent_received_payment'::regclass
  ) then
    alter table "public"."agent_received_payment"
      add constraint "agent_received_payment_agent_id_fkey"
      foreign key ("agent_id") references "public"."agent_profile"("id")
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_received_payment_received_by_fkey'
      and conrelid = 'public.agent_received_payment'::regclass
  ) then
    alter table "public"."agent_received_payment"
      add constraint "agent_received_payment_received_by_fkey"
      foreign key ("received_by") references "auth"."users"("id")
      on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_received_payment_confirmed_payment_id_fkey'
      and conrelid = 'public.agent_received_payment'::regclass
  ) then
    alter table "public"."agent_received_payment"
      add constraint "agent_received_payment_confirmed_payment_id_fkey"
      foreign key ("confirmed_payment_id") references "public"."payment"("id")
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_received_payment_confirmed_by_fkey'
      and conrelid = 'public.agent_received_payment'::regclass
  ) then
    alter table "public"."agent_received_payment"
      add constraint "agent_received_payment_confirmed_by_fkey"
      foreign key ("confirmed_by") references "auth"."users"("id")
      on delete set null;
  end if;
end;
$$;

create index if not exists "agent_received_payment_order_id_idx"
  on "public"."agent_received_payment" using btree ("order_id");

create index if not exists "agent_received_payment_agent_status_idx"
  on "public"."agent_received_payment" using btree ("agent_id", "status");

create index if not exists "agent_received_payment_pending_idx"
  on "public"."agent_received_payment" using btree ("created_at" desc)
  where "status" = 'pending_admin_confirmation';

alter table "public"."agent_received_payment" enable row level security;

drop policy if exists "Admins can manage agent received payments"
  on "public"."agent_received_payment";

create policy "Admins can manage agent received payments"
  on "public"."agent_received_payment"
  to "authenticated"
  using ((select "private"."is_admin"() as "is_admin"))
  with check ((select "private"."is_admin"() as "is_admin"));

drop policy if exists "Agents can read accessible received payments"
  on "public"."agent_received_payment";

create policy "Agents can read accessible received payments"
  on "public"."agent_received_payment"
  for select
  to "authenticated"
  using (
    "agent_id" = (select "private"."current_agent_profile_id"() as "current_agent_profile_id")
    and (select "private"."agent_can_access_order"("agent_received_payment"."order_id") as "agent_can_access_order")
  );

create or replace function "public"."submit_agent_received_payment"(
  "target_order_id" uuid,
  "payment_amount" numeric,
  "payment_method_value" text,
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

  if nullif(trim(payment_method_value), '') is null then
    raise exception 'Payment method is required.';
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
    payment_date,
    reference_number,
    notes,
    received_by
  )
  values (
    target_order_id,
    current_agent_id,
    round(payment_amount, 2),
    trim(payment_method_value),
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
  date,
  text,
  text
) owner to "postgres";

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
    payment_date,
    recorded_by,
    reference_number,
    notes
  )
  values (
    pending_payment.order_id,
    pending_payment.amount,
    pending_payment.payment_method,
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

revoke all on table "public"."agent_received_payment" from "anon";
revoke all on table "public"."agent_received_payment" from "authenticated";
grant all on table "public"."agent_received_payment" to "service_role";
grant select on table "public"."agent_received_payment" to "authenticated";

revoke all on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  date,
  text,
  text
) from public;
revoke execute on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  date,
  text,
  text
) from anon;
grant execute on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  date,
  text,
  text
) to authenticated;
grant execute on function "public"."submit_agent_received_payment"(
  uuid,
  numeric,
  text,
  date,
  text,
  text
) to service_role;

revoke all on function "public"."confirm_agent_received_payment"(uuid, uuid) from public;
revoke execute on function "public"."confirm_agent_received_payment"(uuid, uuid) from anon;
grant execute on function "public"."confirm_agent_received_payment"(uuid, uuid) to authenticated;
grant execute on function "public"."confirm_agent_received_payment"(uuid, uuid) to service_role;
