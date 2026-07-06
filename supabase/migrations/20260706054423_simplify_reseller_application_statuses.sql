update public.reseller_application
set
  application_status = case
    when application_status in ('qualified') then 'contacted'
    when application_status in ('rejected', 'spam') then 'closed'
    else application_status
  end,
  updated_at = now()
where application_status in ('qualified', 'rejected', 'spam');

alter table public.reseller_application
drop constraint if exists reseller_application_status_check;

alter table public.reseller_application
add constraint reseller_application_status_check
check (application_status in ('submitted', 'contacted', 'closed'));
