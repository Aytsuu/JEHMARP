alter table "public"."agent_order_item"
    add column if not exists "agent_commission_amount" numeric(12,2) default 0 not null,
    add column if not exists "agent_commission_updated_by" "uuid",
    add column if not exists "agent_commission_updated_at" timestamp with time zone;

alter table "public"."agent_order_item"
    add constraint "agent_order_item_commission_amount_check" check (("agent_commission_amount" >= (0)::numeric));

alter table only "public"."agent_order_item"
    add constraint "agent_order_item_agent_commission_updated_by_fkey" foreign key ("agent_commission_updated_by") references "auth"."users"("id") on delete set null;

create or replace function "private"."calculate_product_agent_commission"(
  "target_product_id" "uuid",
  "target_quantity" numeric,
  "target_unit_price" numeric
) returns numeric
    language "sql"
    stable
    set "search_path" to ''
    as $$
  select round(
    coalesce(
      case product.agent_commission_type
        when 'percentage' then coalesce(target_unit_price, product.default_price, 0) * coalesce(target_quantity, 0) * product.agent_commission_value / 100
        else coalesce(target_quantity, 0) * product.agent_commission_value
      end,
      0
    ),
    2
  )
  from public.product
  where product.id = target_product_id
$$;

alter function "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) owner to "postgres";

create or replace function "private"."sync_agent_order_item_commission"() returns "trigger"
    language "plpgsql"
    set "search_path" to ''
    as $$
begin
  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id
     or new.quantity is distinct from old.quantity then
    if new.agent_commission_amount = 0
       and new.agent_commission_updated_by is null
       and new.agent_commission_updated_at is null then
      new.agent_commission_amount := coalesce(
        private.calculate_product_agent_commission(new.product_id, new.quantity, null),
        0
      );
    end if;
  end if;

  return new;
end;
$$;

alter function "private"."sync_agent_order_item_commission"() owner to "postgres";

update public.agent_order_item
set agent_commission_amount = coalesce(
  private.calculate_product_agent_commission(
    agent_order_item.product_id,
    agent_order_item.quantity,
    null
  ),
  0
)
where agent_commission_amount = 0
  and agent_commission_updated_by is null
  and agent_commission_updated_at is null;

drop trigger if exists "sync_agent_order_item_commission" on "public"."agent_order_item";

create trigger "sync_agent_order_item_commission"
    before insert or update of "product_id", "quantity" on "public"."agent_order_item"
    for each row
    execute function "private"."sync_agent_order_item_commission"();

revoke all on function "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) from public;
grant all on function "private"."calculate_product_agent_commission"("target_product_id" "uuid", "target_quantity" numeric, "target_unit_price" numeric) to "service_role";

revoke all on function "private"."sync_agent_order_item_commission"() from public;
