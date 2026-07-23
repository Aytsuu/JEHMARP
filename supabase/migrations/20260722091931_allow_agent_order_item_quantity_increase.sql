create or replace function "public"."update_agent_order_item_quantity"(
  "target_agent_order_item_id" "uuid",
  "new_quantity" numeric
) returns "uuid"
  language "plpgsql"
  security definer
  set "search_path" to ''
  as $$
declare
  current_item record;
  approved_distributed numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to update agent order quantity.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can update agent order item quantity.';
  end if;

  select
    agent_order_item.id,
    agent_order_item.agent_order_id,
    agent_order_item.product_id,
    agent_order_item.quantity
  into current_item
  from public.agent_order_item
  where agent_order_item.id = target_agent_order_item_id
  limit 1;

  if current_item.id is null then
    raise exception 'Agent order item was not found.';
  end if;

  if private.agent_order_item_is_fully_paid(current_item.agent_order_id) then
    raise exception 'Agent order quantity cannot be edited after all customer orders are fully paid.';
  end if;

  if new_quantity is null or new_quantity <= 0 then
    raise exception 'Agent order item quantity must be greater than zero.';
  end if;

  approved_distributed := private.agent_order_approved_distributed_quantity(
    current_item.agent_order_id,
    current_item.product_id
  );

  if new_quantity < approved_distributed then
    raise exception 'Cannot set quantity below distributed customer allocations.';
  end if;

  update public.agent_order_item
  set quantity = new_quantity,
      updated_at = now()
  where id = current_item.id;

  return current_item.id;
end;
$$;

alter function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) owner to "postgres";

revoke all on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) from public;
revoke execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) from anon;
revoke execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) from authenticated;
grant execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) to authenticated;
grant execute on function "public"."update_agent_order_item_quantity"("target_agent_order_item_id" "uuid", "new_quantity" numeric) to service_role;
