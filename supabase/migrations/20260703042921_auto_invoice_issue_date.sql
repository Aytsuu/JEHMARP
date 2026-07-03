update public.invoice
set issued_at = coalesce(issued_at, created_at, now()),
    updated_at = now()
where issued_at is null;

alter table public.invoice
  alter column issued_at set default now();

alter table public.invoice
  alter column status set default 'issued';
