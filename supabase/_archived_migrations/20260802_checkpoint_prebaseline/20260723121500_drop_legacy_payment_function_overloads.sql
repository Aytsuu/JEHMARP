-- Drop obsolete payment RPC overloads left from pre-payment-terms signatures.

drop function if exists public.submit_agent_received_payment(uuid, numeric, text, date, text, text);
drop function if exists public.submit_agent_received_payment_distribution(uuid[], numeric, text, date, text, text);
drop function if exists public.apply_customer_payment_distribution(uuid, numeric, text, date, uuid, text, text);

-- Also drop date-based overloads superseded by timestamptz signatures in 20260721180000.
drop function if exists public.submit_agent_received_payment(uuid, numeric, text, text, date, text, text);
drop function if exists public.submit_agent_received_payment_distribution(uuid[], numeric, text, text, date, text, text);
drop function if exists public.apply_customer_payment_distribution(uuid, numeric, text, text, date, uuid, text, text);

create or replace function private.parse_schedule_timestamp(
  schedule_date text,
  schedule_time text default null
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
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

create or replace function public.confirm_agent_received_payment(
  agent_payment_id uuid,
  recorded_by_value uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
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
