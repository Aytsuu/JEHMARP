create or replace function "private"."close_paid_customer_order"("target_order_id" "uuid") returns "void"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
begin
  update public.customer_order
  set order_status = 'closed',
      updated_at = now()
  where id = target_order_id
    and payment_status = 'paid'
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public.invoice
      where invoice.order_id = target_order_id
    );
end;
$$;

alter function "private"."close_paid_customer_order"("target_order_id" "uuid") owner to "postgres";

create or replace function "private"."refresh_order_financial_status"("target_order_id" "uuid") returns "void"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
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

alter function "private"."refresh_order_financial_status"("target_order_id" "uuid") owner to "postgres";

create or replace function "private"."close_paid_customer_order_after_payment_status_change"() returns "trigger"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
begin
  if new.payment_status = 'paid'
     and old.payment_status is distinct from new.payment_status then
    perform private.close_paid_customer_order(new.id);
  end if;

  return new;
end;
$$;

alter function "private"."close_paid_customer_order_after_payment_status_change"() owner to "postgres";

drop trigger if exists "close_paid_customer_order_after_payment_status_change" on "public"."customer_order";

create trigger "close_paid_customer_order_after_payment_status_change"
    after update of "payment_status" on "public"."customer_order"
    for each row
    execute function "private"."close_paid_customer_order_after_payment_status_change"();

create or replace function "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") returns "void"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
begin
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

alter function "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") owner to "postgres";

create or replace function "private"."refresh_agent_order_after_customer_order_change"() returns "trigger"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.agent_order_id is not null then
    perform private.refresh_agent_order_status(old.agent_order_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.agent_order_id is not null then
    perform private.refresh_agent_order_status(new.agent_order_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function "private"."refresh_agent_order_after_customer_order_change"() owner to "postgres";

drop trigger if exists "refresh_agent_order_after_customer_order_change" on "public"."customer_order";

create trigger "refresh_agent_order_after_customer_order_change"
    after insert or delete or update of "agent_order_id", "payment_status" on "public"."customer_order"
    for each row
    execute function "private"."refresh_agent_order_after_customer_order_change"();

revoke all on function "private"."close_paid_customer_order"("target_order_id" "uuid") from public;
revoke all on function "private"."close_paid_customer_order_after_payment_status_change"() from public;
revoke all on function "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") from public;
revoke all on function "private"."refresh_agent_order_after_customer_order_change"() from public;
revoke all on function "private"."refresh_order_financial_status"("target_order_id" "uuid") from public;

grant all on function "private"."close_paid_customer_order"("target_order_id" "uuid") to "service_role";
grant all on function "private"."refresh_agent_order_status"("target_agent_order_id" "uuid") to "service_role";
grant all on function "private"."refresh_order_financial_status"("target_order_id" "uuid") to "service_role";
