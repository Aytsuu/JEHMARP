update public.page
set title = replace(replace(title, 'NMC Meatshop', 'JEHMARP'), 'NMC', 'JEHMARP')
where title like '%NMC%';

update public.page_section
set content = replace(
  replace(content::text, 'NMC Meatshop', 'JEHMARP'),
  'NMC',
  'JEHMARP'
)::jsonb
where content::text like '%NMC%';
