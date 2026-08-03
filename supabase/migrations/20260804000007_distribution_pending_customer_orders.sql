-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260804000007_distribution_pending_customer_orders.sql

create or replace function public.list_distribution_pending_customer_orders(target_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pending_rows.id,
        'customer_label', pending_rows.customer_label,
        'created_at', pending_rows.created_at,
        'total_amount', pending_rows.total_amount,
        'href', pending_rows.href
      )
      order by pending_rows.created_at desc, pending_rows.id desc
    ),
    '[]'::jsonb
  )
  from (
    select
      child_order.id,
      trim(concat_ws(' ', customer_person.first_name, customer_person.last_name)) as customer_label,
      child_order.created_at,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then order_item.partial_quantity
              else order_item.final_quantity
            end * order_item.unit_price
          ),
          0
        ),
        2
      ) as total_amount,
      '/admin/orders/customer/' || child_order.id::text as href
    from public."order" child_order
    join public.customer
      on customer.id = child_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.invoice
      on invoice.order_id = child_order.id
    left join public.order_item
      on order_item.order_id = child_order.id
      and order_item.order_kind in ('customer', 'personal')
    where child_order.parent_order_id = target_order_id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
      and child_order.order_status = 'pending'
    group by
      child_order.id,
      customer_person.first_name,
      customer_person.last_name,
      child_order.created_at
  ) as pending_rows;
$$;

alter function public.list_distribution_pending_customer_orders(uuid) owner to postgres;

revoke all on function public.list_distribution_pending_customer_orders(uuid) from public;
grant execute on function public.list_distribution_pending_customer_orders(uuid) to service_role;
