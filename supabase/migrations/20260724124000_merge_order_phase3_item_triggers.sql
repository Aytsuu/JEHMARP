-- Phase 3d: Fix order_item triggers for unified order kinds

create or replace function private.sync_order_item_price_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_customer_is_reseller boolean;
  retail_price numeric;
  reseller_price_value numeric;
begin
  if new.order_kind = 'distribution' then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select customer.is_reseller
    into order_customer_is_reseller
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    where order_row.id = new.order_id
      and order_row.order_kind in ('customer', 'personal');

    if order_customer_is_reseller is null then
      raise exception 'Order % does not have a valid customer for pricing.', new.order_id;
    end if;

    select product.default_price, product.reseller_price
    into retail_price, reseller_price_value
    from public.product
    where product.id = new.product_id;

    if retail_price is null or reseller_price_value is null then
      raise exception 'Product % does not have valid prices for order item pricing.', new.product_id;
    end if;

    if order_customer_is_reseller then
      new.unit_price := reseller_price_value;
      new.price_type := 'reseller';
    else
      new.unit_price := retail_price;
      new.price_type := 'retail';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.sync_agent_order_item_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_kind <> 'distribution' then
    return new;
  end if;

  new.agent_commission_amount := coalesce(
    private.calculate_product_agent_commission(new.product_id, new.partial_quantity, null),
    0
  );

  return new;
end;
$$;

create or replace function private.customer_order_item_view_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_item target_item
  set
    order_id = coalesce(new.order_id, old.order_id),
    product_id = coalesce(new.product_id, old.product_id),
    partial_quantity = coalesce(new.partial_quantity, old.partial_quantity),
    final_quantity = coalesce(new.final_quantity, old.final_quantity),
    updated_at = coalesce(new.updated_at, now()),
    add_details = coalesce(new.add_details, old.add_details),
    agent_commission_amount = coalesce(new.agent_commission_amount, old.agent_commission_amount),
    agent_commission_set_by = coalesce(new.agent_commission_set_by, old.agent_commission_set_by),
    agent_commission_set_at = coalesce(new.agent_commission_set_at, old.agent_commission_set_at),
    unit_price = coalesce(new.unit_price, old.unit_price),
    price_type = coalesce(new.price_type, old.price_type),
    agent_commission_paid = coalesce(new.agent_commission_paid, old.agent_commission_paid),
    agent_order_quantity_increase = coalesce(
      new.agent_order_quantity_increase,
      old.agent_order_quantity_increase
    )
  where target_item.id = old.id
    and target_item.order_kind in ('customer', 'personal');

  if not found then
    raise exception 'Customer order item % was not found.', old.id;
  end if;

  return new;
end;
$$;
