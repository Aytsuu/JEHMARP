-- Customer tracking numbers for public order lookup without an account.

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
  position integer;
begin
  loop
    candidate := 'JHM-';

    for position in 1..8 loop
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

revoke all on function private.generate_customer_tracking_number() from public;

alter table public.customer
  add column if not exists tracking_number text;

update public.customer
set tracking_number = private.generate_customer_tracking_number()
where tracking_number is null;

alter table public.customer
  alter column tracking_number set not null;

create unique index if not exists customer_tracking_number_key
  on public.customer (tracking_number);

create or replace function private.set_customer_tracking_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tracking_number is null then
    new.tracking_number := private.generate_customer_tracking_number();
  end if;

  return new;
end;
$$;

alter function private.set_customer_tracking_number() owner to postgres;

drop trigger if exists set_customer_tracking_number on public.customer;

create trigger set_customer_tracking_number
before insert on public.customer
for each row
execute function private.set_customer_tracking_number();

create or replace function public.get_customer_orders_by_tracking_number(
  p_tracking_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_tracking_number text;
  resolved_customer_id uuid;
  orders_payload jsonb;
begin
  normalized_tracking_number := upper(trim(coalesce(p_tracking_number, '')));

  if normalized_tracking_number !~ '^JHM-[A-Z2-9]{8}$' then
    return null;
  end if;

  select customer.id
  into resolved_customer_id
  from public.customer
  where customer.tracking_number = normalized_tracking_number;

  if resolved_customer_id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', customer_order.id,
        'orderStatus', customer_order.order_status,
        'paymentStatus', customer_order.payment_status,
        'source', customer_order.source,
        'createdAt', customer_order.created_at,
        'items', coalesce(order_items.items, '[]'::jsonb)
      )
      order by customer_order.created_at desc
    ),
    '[]'::jsonb
  )
  into orders_payload
  from public.customer_order
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'productName', product.name,
        'quantity', customer_order_item.final_quantity,
        'unitLabel', product.unit_label,
        'addDetails', customer_order_item.add_details
      )
      order by product.name
    ) as items
    from public.customer_order_item
    join public.product
      on product.id = customer_order_item.product_id
    where customer_order_item.order_id = customer_order.id
  ) as order_items
    on true
  where customer_order.customer_id = resolved_customer_id;

  return jsonb_build_object(
    'trackingNumber', normalized_tracking_number,
    'orders', orders_payload
  );
end;
$$;

alter function public.get_customer_orders_by_tracking_number(text) owner to postgres;

revoke all on function public.get_customer_orders_by_tracking_number(text) from public;
grant execute on function public.get_customer_orders_by_tracking_number(text) to service_role;
