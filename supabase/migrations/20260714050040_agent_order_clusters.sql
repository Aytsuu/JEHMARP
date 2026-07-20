create table if not exists "public"."agent_order" (
    "id" "uuid" default "extensions"."gen_random_uuid"() not null,
    "agent_id" "uuid" not null,
    "order_status" "text" default 'pending_customers'::"text" not null,
    "notes" "text",
    "submitted_by" "uuid",
    "admin_read_at" timestamp with time zone,
    "admin_read_by" "uuid",
    "created_at" timestamp with time zone default "now"() not null,
    "updated_at" timestamp with time zone default "now"() not null,
    constraint "agent_order_order_status_check" check (("order_status" = any (array['pending_customers'::"text", 'pending_order'::"text", 'processing'::"text", 'closed'::"text"])))
);

alter table "public"."agent_order" owner to "postgres";

create table if not exists "public"."agent_order_item" (
    "id" "uuid" default "extensions"."gen_random_uuid"() not null,
    "agent_order_id" "uuid" not null,
    "product_id" "uuid" not null,
    "quantity" numeric(12,3) not null,
    "add_details" "text",
    "created_at" timestamp with time zone default "now"() not null,
    "updated_at" timestamp with time zone default "now"() not null,
    constraint "agent_order_item_quantity_check" check (("quantity" > (0)::numeric))
);

alter table "public"."agent_order_item" owner to "postgres";

alter table only "public"."agent_order"
    add constraint "agent_order_pkey" primary key ("id");

alter table only "public"."agent_order_item"
    add constraint "agent_order_item_pkey" primary key ("id");

alter table only "public"."agent_order"
    add constraint "agent_order_admin_read_by_fkey" foreign key ("admin_read_by") references "auth"."users"("id") on delete set null;

alter table only "public"."agent_order"
    add constraint "agent_order_agent_id_fkey" foreign key ("agent_id") references "public"."agent_profile"("id") on delete restrict;

alter table only "public"."agent_order"
    add constraint "agent_order_submitted_by_fkey" foreign key ("submitted_by") references "auth"."users"("id") on delete set null;

alter table only "public"."agent_order_item"
    add constraint "agent_order_item_agent_order_id_fkey" foreign key ("agent_order_id") references "public"."agent_order"("id") on delete cascade;

alter table only "public"."agent_order_item"
    add constraint "agent_order_item_product_id_fkey" foreign key ("product_id") references "public"."product"("id") on delete restrict;

alter table "public"."customer_order"
    add column if not exists "agent_order_id" "uuid";

alter table only "public"."customer_order"
    drop constraint if exists "customer_order_agent_order_id_fkey";

alter table only "public"."customer_order"
    add constraint "customer_order_agent_order_id_fkey" foreign key ("agent_order_id") references "public"."agent_order"("id") on delete set null;

create index if not exists "agent_order_agent_id_idx" on "public"."agent_order" using "btree" ("agent_id");
create index if not exists "agent_order_created_at_idx" on "public"."agent_order" using "btree" ("created_at" desc);
create index if not exists "agent_order_order_status_idx" on "public"."agent_order" using "btree" ("order_status");
create index if not exists "agent_order_admin_unread_idx" on "public"."agent_order" using "btree" ("created_at" desc) where (("admin_read_at" is null) and ("order_status" = any (array['pending_customers'::"text", 'pending_order'::"text"])));
create index if not exists "agent_order_item_agent_order_id_idx" on "public"."agent_order_item" using "btree" ("agent_order_id");
create index if not exists "agent_order_item_product_id_idx" on "public"."agent_order_item" using "btree" ("product_id");
create index if not exists "customer_order_agent_order_id_idx" on "public"."customer_order" using "btree" ("agent_order_id");

do $$
declare
  order_record record;
  inserted_agent_order_id uuid;
begin
  for order_record in
    select id, agent_id, submitted_by, admin_read_at, admin_read_by, created_at, updated_at, order_status, notes
    from public.customer_order
    where source = 'agent_submitted'
      and agent_id is not null
      and agent_order_id is null
  loop
    insert into public.agent_order (
      agent_id,
      order_status,
      notes,
      submitted_by,
      admin_read_at,
      admin_read_by,
      created_at,
      updated_at
    )
    values (
      order_record.agent_id,
      case
        when order_record.order_status = 'pending' then 'pending_order'
        else order_record.order_status
      end,
      order_record.notes,
      order_record.submitted_by,
      order_record.admin_read_at,
      order_record.admin_read_by,
      order_record.created_at,
      order_record.updated_at
    )
    returning id into inserted_agent_order_id;

    update public.customer_order
    set agent_order_id = inserted_agent_order_id
    where id = order_record.id;

    insert into public.agent_order_item (
      agent_order_id,
      product_id,
      quantity,
      add_details,
      created_at,
      updated_at
    )
    select
      inserted_agent_order_id,
      product_id,
      partial_quantity,
      add_details,
      created_at,
      updated_at
    from public.customer_order_item
    where order_id = order_record.id;
  end loop;
end $$;

create or replace function "private"."sync_agent_order_status_from_customer_link"() returns "trigger"
    language "plpgsql"
    set "search_path" to ''
    as $$
begin
  if new.agent_order_id is not null then
    update public.agent_order
    set order_status = 'pending_order',
        updated_at = now()
    where id = new.agent_order_id
      and order_status = 'pending_customers';
  end if;

  return new;
end;
$$;

alter function "private"."sync_agent_order_status_from_customer_link"() owner to "postgres";

drop trigger if exists "sync_agent_order_status_from_customer_link" on "public"."customer_order";

create trigger "sync_agent_order_status_from_customer_link"
    after insert or update of "agent_order_id" on "public"."customer_order"
    for each row
    execute function "private"."sync_agent_order_status_from_customer_link"();

create or replace function "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb" default null::"jsonb") returns "uuid"
    language "plpgsql" security definer
    set "search_path" to ''
    as $$
declare
  current_agent_id uuid;
  inserted_agent_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select id
  into current_agent_id
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  insert into public.agent_order (
    agent_id,
    order_status,
    submitted_by
  )
  values (
    current_agent_id,
    'pending_customers',
    (select auth.uid())
  )
  returning id into inserted_agent_order_id;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for agent ordering.', item_product_id;
    end if;

    insert into public.agent_order_item (
      agent_order_id,
      product_id,
      quantity,
      add_details
    )
    values (
      inserted_agent_order_id,
      item_product_id,
      item_quantity,
      item_details
    );
  end loop;

  if not exists (
    select 1
    from public.agent_order_item
    where agent_order_id = inserted_agent_order_id
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_agent_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Agent order payload contains an invalid product id or quantity.';
end;
$$;

alter function "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") owner to "postgres";

alter table "public"."agent_order" enable row level security;
alter table "public"."agent_order_item" enable row level security;

create policy "Admins can manage agent orders" on "public"."agent_order" to "authenticated" using ((select "private"."is_admin"() as "is_admin")) with check ((select "private"."is_admin"() as "is_admin"));

create policy "Admins can manage agent order items" on "public"."agent_order_item" to "authenticated" using ((select "private"."is_admin"() as "is_admin")) with check ((select "private"."is_admin"() as "is_admin"));

create policy "Agents can read own agent orders" on "public"."agent_order" for select to "authenticated" using (("agent_id" = (select "private"."current_agent_profile_id"() as "current_agent_profile_id")));

create policy "Agents can insert own agent orders" on "public"."agent_order" for insert to "authenticated" with check (("agent_id" = (select "private"."current_agent_profile_id"() as "current_agent_profile_id")));

create policy "Agents can update own draft agent orders" on "public"."agent_order" for update to "authenticated" using (("agent_id" = (select "private"."current_agent_profile_id"() as "current_agent_profile_id")) and ("order_status" = any (array['pending_customers'::"text", 'pending_order'::"text"]))) with check (("agent_id" = (select "private"."current_agent_profile_id"() as "current_agent_profile_id")));

create policy "Agents can read own agent order items" on "public"."agent_order_item" for select to "authenticated" using (exists (
  select 1
  from public.agent_order
  where agent_order.id = agent_order_item.agent_order_id
    and agent_order.agent_id = (select private.current_agent_profile_id())
));

create policy "Agents can insert own agent order items" on "public"."agent_order_item" for insert to "authenticated" with check (exists (
  select 1
  from public.agent_order
  where agent_order.id = agent_order_item.agent_order_id
    and agent_order.agent_id = (select private.current_agent_profile_id())
));

create policy "Agents can update own draft agent order items" on "public"."agent_order_item" for update to "authenticated" using (exists (
  select 1
  from public.agent_order
  where agent_order.id = agent_order_item.agent_order_id
    and agent_order.agent_id = (select private.current_agent_profile_id())
    and agent_order.order_status = any (array['pending_customers'::"text", 'pending_order'::"text"])
)) with check (exists (
  select 1
  from public.agent_order
  where agent_order.id = agent_order_item.agent_order_id
    and agent_order.agent_id = (select private.current_agent_profile_id())
));

revoke all on function "private"."sync_agent_order_status_from_customer_link"() from public;

revoke all on function "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") from public;
grant all on function "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") to "service_role";
grant all on function "public"."submit_agent_order"("target_customer_id" "uuid", "item_payload" "jsonb", "customer_payload" "jsonb") to "authenticated";

grant all on table "public"."agent_order" to "service_role";
grant select,insert,delete,update on table "public"."agent_order" to "authenticated";

grant all on table "public"."agent_order_item" to "service_role";
grant select,insert,delete,update on table "public"."agent_order_item" to "authenticated";
