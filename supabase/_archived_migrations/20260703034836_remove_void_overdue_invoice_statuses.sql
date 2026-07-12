alter table public.invoice
  disable trigger validate_invoice_status_transition;

alter table public.invoice
  disable trigger record_invoice_status_update;

update public.invoice
set status = 'issued',
    updated_at = now()
where status in ('void', 'overdue');

alter table public.invoice
  enable trigger record_invoice_status_update;

alter table public.invoice
  enable trigger validate_invoice_status_transition;

alter table public.invoice
  drop constraint if exists invoice_status_check;

alter table public.invoice
  add constraint invoice_status_check
  check (status in ('draft', 'issued', 'partially_paid', 'paid'));

create or replace function private.derive_invoice_status(target_order_id uuid, current_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with invoice_row as (
    select invoice.status
    from public.invoice
    where invoice.order_id = target_order_id
    limit 1
  ),
  totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total
    from invoice_row
  )
  select case
    when invoice_total <= 0 then 'paid'
    when payment_total >= invoice_total then 'paid'
    when payment_total > 0 then 'partially_paid'
    when current_status = 'draft' then 'draft'
    else 'issued'
  end
  from totals;
$$;

create or replace function private.is_valid_invoice_status_transition(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when from_status is null then to_status in ('draft', 'issued', 'partially_paid', 'paid')
    when from_status = to_status then true
    when from_status = 'draft' then to_status in ('issued', 'partially_paid', 'paid')
    when from_status = 'issued' then to_status in ('partially_paid', 'paid')
    when from_status = 'partially_paid' then to_status in ('issued', 'paid')
    when from_status = 'paid' then to_status in ('partially_paid')
    else false
  end;
$$;

revoke all on function private.derive_invoice_status(uuid, text) from public;
revoke all on function private.is_valid_invoice_status_transition(text, text) from public;
grant execute on function private.derive_invoice_status(uuid, text) to service_role;
grant execute on function private.is_valid_invoice_status_transition(text, text) to service_role;
