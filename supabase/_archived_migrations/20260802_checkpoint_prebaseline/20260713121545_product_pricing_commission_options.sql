alter table "public"."product"
  drop constraint if exists "product_category_check";

drop function if exists "public"."deactivate_product"("uuid");

alter table "public"."product"
  add column if not exists "reseller_deduction_type" text not null default 'value',
  add column if not exists "reseller_deduction_value" numeric(12,2) not null default 0,
  add column if not exists "agent_commission_type" text not null default 'value',
  add column if not exists "agent_commission_value" numeric(12,2) not null default 0;

update "public"."product"
set "reseller_deduction_value" = greatest("default_price" - "reseller_price", 0)
where "reseller_deduction_type" = 'value'
  and "reseller_deduction_value" = 0;

alter table "public"."product"
  add constraint "product_category_not_blank_check" check (length(btrim("category")) > 0),
  add constraint "product_unit_label_not_blank_check" check (length(btrim("unit_label")) > 0),
  add constraint "product_reseller_deduction_type_check" check ("reseller_deduction_type" = any (array['value'::text, 'percentage'::text])),
  add constraint "product_reseller_deduction_value_check" check ("reseller_deduction_value" >= 0),
  add constraint "product_reseller_deduction_percentage_check" check ("reseller_deduction_type" <> 'percentage'::text or "reseller_deduction_value" <= 100),
  add constraint "product_reseller_deduction_amount_check" check ("reseller_deduction_type" <> 'value'::text or "reseller_deduction_value" <= "default_price"),
  add constraint "product_agent_commission_type_check" check ("agent_commission_type" = any (array['value'::text, 'percentage'::text])),
  add constraint "product_agent_commission_value_check" check ("agent_commission_value" >= 0),
  add constraint "product_agent_commission_percentage_check" check ("agent_commission_type" <> 'percentage'::text or "agent_commission_value" <= 100);

comment on column "public"."product"."category" is 'Product category label. Defaults are provided by the admin UI and custom labels are inferred from saved products.';
comment on column "public"."product"."unit_label" is 'Product unit label. Defaults are provided by the admin UI and custom labels are inferred from saved products.';
comment on column "public"."product"."reseller_deduction_type" is 'How reseller_price is derived from default_price: value or percentage.';
comment on column "public"."product"."reseller_deduction_value" is 'Deduction value applied to default_price when deriving reseller_price.';
comment on column "public"."product"."agent_commission_type" is 'How the default agent commission is calculated per product unit: value or percentage.';
comment on column "public"."product"."agent_commission_value" is 'Default agent commission value per product unit.';

create or replace function "private"."sync_order_item_price_snapshot"() returns "trigger"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
declare
  order_customer_is_reseller boolean;
  retail_price numeric;
  reseller_price_value numeric;
  product_agent_commission_type text;
  product_agent_commission_value numeric;
  commission_unit_price numeric;
begin
  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select customer.is_reseller
    into order_customer_is_reseller
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    where customer_order.id = new.order_id;

    if order_customer_is_reseller is null then
      raise exception 'Order % does not have a valid customer for pricing.', new.order_id;
    end if;

    select
      product.default_price,
      product.reseller_price,
      product.agent_commission_type,
      product.agent_commission_value
    into
      retail_price,
      reseller_price_value,
      product_agent_commission_type,
      product_agent_commission_value
    from public.product
    where product.id = new.product_id;

    if retail_price is null or reseller_price_value is null then
      raise exception 'Product % does not have valid prices for order item pricing.', new.product_id;
    end if;

    new.price_type := case
      when order_customer_is_reseller then 'reseller'
      else 'retail'
    end;
    new.unit_price := case
      when order_customer_is_reseller then reseller_price_value
      else retail_price
    end;
  end if;

  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id
     or new.partial_quantity is distinct from old.partial_quantity then
    if new.agent_commission_amount = 0
       and new.agent_commission_paid = false
       and new.agent_commission_set_by is null
       and new.agent_commission_set_at is null then
      if product_agent_commission_type is null or product_agent_commission_value is null then
        select product.agent_commission_type, product.agent_commission_value
        into product_agent_commission_type, product_agent_commission_value
        from public.product
        where product.id = new.product_id;
      end if;

      commission_unit_price := case product_agent_commission_type
        when 'percentage' then coalesce(new.unit_price, 0) * product_agent_commission_value / 100
        else product_agent_commission_value
      end;

      new.agent_commission_amount := round(coalesce(commission_unit_price, 0) * new.partial_quantity, 2);
    end if;
  end if;

  return new;
end;
$$;

alter function "private"."sync_order_item_price_snapshot"() owner to "postgres";

drop trigger if exists "sync_order_item_price_snapshot" on "public"."customer_order_item";

create trigger "sync_order_item_price_snapshot"
  before insert or update of "product_id", "partial_quantity"
  on "public"."customer_order_item"
  for each row
  execute function "private"."sync_order_item_price_snapshot"();
