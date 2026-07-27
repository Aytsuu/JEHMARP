update public.platform_settings
set settings = jsonb_set(
  jsonb_set(
    settings,
    '{businessProfile,phone}',
    to_jsonb('09322159289 | 09177770118'::text),
    true
  ),
  '{businessProfile,primaryEmail}',
  to_jsonb('jehmarp2020@gmail.com'::text),
  true
)
where id = 'default'
  and coalesce(settings #>> '{businessProfile,primaryEmail}', '') = ''
  and coalesce(settings #>> '{businessProfile,phone}', '') in (
    '',
    '0917 777 0118 | 0932 215 9289'
  );

update public.page_section
set content = jsonb_set(
  jsonb_set(
    content,
    '{email}',
    to_jsonb('jehmarp2020@gmail.com'::text),
    true
  ),
  '{phone}',
  to_jsonb('09322159289 | 09177770118'::text),
  true
)
where type = 'contact_details'
  and page_id = (
    select id
    from public.page
    where slug = 'contact'
    limit 1
  )
  and coalesce(content #>> '{email}', '') in ('', 'jehmarp2020@gmail.com')
  and coalesce(content #>> '{phone}', '') in (
    '',
    '0917 777 0118 | 0932 215 9289',
    '09322159289 | 09177770118'
  );
