alter table "public"."customer_order"
  add column if not exists "release_date" "date";

create index if not exists "customer_order_release_date_idx"
  on "public"."customer_order" using "btree" ("release_date")
  where "release_date" is not null;
