create or replace function "public"."deactivate_product"("target_product_id" "uuid")
returns "public"."product"
language "plpgsql"
set "search_path" to ''
as $$
declare
  updated_product public.product;
begin
  update public.product
  set is_active = false,
      updated_at = now()
  where id = target_product_id
  returning * into updated_product;

  if updated_product.id is null then
    raise exception 'Product % was not found or cannot be deactivated by the current role.', target_product_id;
  end if;

  return updated_product;
end;
$$;

alter function "public"."deactivate_product"("target_product_id" "uuid") owner to "postgres";

revoke all on function "public"."deactivate_product"("target_product_id" "uuid") from public;
grant all on function "public"."deactivate_product"("target_product_id" "uuid") to "anon";
grant all on function "public"."deactivate_product"("target_product_id" "uuid") to "authenticated";
grant all on function "public"."deactivate_product"("target_product_id" "uuid") to "service_role";
