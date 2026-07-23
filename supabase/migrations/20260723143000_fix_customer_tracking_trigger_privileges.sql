-- Customer inserts run as authenticated/service_role, but the tracking trigger
-- calls a private generator function owned by postgres. Run the trigger as the
-- function owner so inserts do not fail with "permission denied".

create or replace function private.set_customer_tracking_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tracking_number is null then
    new.tracking_number := private.generate_customer_tracking_number();
  end if;

  return new;
end;
$$;

alter function private.set_customer_tracking_number() owner to postgres;
