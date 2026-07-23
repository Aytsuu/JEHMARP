-- Point payment distribution at unified order table after compat view removal.

create or replace function public.apply_customer_payment_distribution(
  target_customer_id uuid,
  payment_amount numeric,
  payment_method_value text,
  payment_terms_value text,
  payment_date_value timestamptz,
  recorded_by_value uuid,
  reference_number_value text default null,
  notes_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  from public."order" customer_order
  where customer_order.order_kind in ('customer', 'personal')
    and customer_order.customer_id = target_customer_id
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
    from public."order" customer_order
    where customer_order.order_kind in ('customer', 'personal')
      and customer_order.customer_id = target_customer_id
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

alter function public.apply_customer_payment_distribution(
  uuid,
  numeric,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text
) owner to postgres;

create or replace function private.generate_customer_tracking_number()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := 'JHM-';

    for char_index in 1..8 loop
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::integer,
        1
      );
    end loop;

    if not exists (
      select 1
      from public.customer
      where tracking_number = candidate
    ) then
      return candidate;
    end if;

    attempt := attempt + 1;

    if attempt > 50 then
      raise exception 'Unable to generate unique customer tracking number.';
    end if;
  end loop;

  return null;
end;
$$;

alter function private.generate_customer_tracking_number() owner to postgres;
