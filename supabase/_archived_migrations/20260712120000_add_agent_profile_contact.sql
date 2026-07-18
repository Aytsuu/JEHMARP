alter table public.agent_profile
  add column contact text;

update public.agent_profile
set contact = case user_id
  when '22222222-2222-2222-2222-222222222222' then '09170000001'
  else '09' || substr(replace(id::text, '-', ''), 1, 9)
end
where contact is null;

alter table public.agent_profile
  alter column contact set not null;

alter table public.agent_profile
  add constraint agent_profile_contact_key unique (contact);

create index agent_profile_contact_idx on public.agent_profile (contact);
