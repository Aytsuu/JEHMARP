update public.page_section
set
  content = jsonb_build_object(
    'heading',
    coalesce(content->>'heading', 'FROM FARM TO TABLE')
  ),
  updated_at = now()
where page_id = (
  select id
  from public.page
  where slug = 'home'
)
and type = 'hero';
