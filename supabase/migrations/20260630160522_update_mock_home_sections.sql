with home_sections as (
  select
    page.id as page_id,
    seed.type,
    seed.sort_order,
    seed.content,
    'published'::text as status
  from (
    values
      (
        'hero',
        0,
        jsonb_build_object(
          'heading', 'Fresh farm products for local tables',
          'summary', 'Temporary mock hero content for the public home page. This will be replaced later with final content.',
          'supportingText', 'Browse current mock pork, chicken, and egg listings while the final public copy is still being prepared.',
          'primaryActionLabel', 'Browse shop',
          'primaryActionHref', '/shop',
          'secondaryActionLabel', 'Read our story',
          'secondaryActionHref', '/our-story'
        )
      ),
      (
        'about',
        1,
        jsonb_build_object(
          'heading', 'About NMC',
          'summary', 'NMC is presented here as a dependable local source for pork, chicken, and eggs, serving households and small buyers with a straightforward ordering process.',
          'body', 'This mock section exists so the home page can show real database-driven content before the final public copy and media are approved.'
        )
      ),
      (
        'mission_vision_core_values',
        2,
        jsonb_build_object(
          'heading', 'Mission, Vision, and Core Values',
          'mission', 'Make everyday ordering of farm products clearer, faster, and easier to trust.',
          'vision', 'Be the local supplier customers remember first when they need consistent fresh products.',
          'coreValues', jsonb_build_array(
            'Clarity in ordering',
            'Consistency in supply',
            'Respect for customers',
            'Practical service'
          )
        )
      ),
      (
        'taglines',
        3,
        jsonb_build_object(
          'heading', 'Taglines',
          'items', jsonb_build_array(
            'Fresh choices for everyday kitchens.',
            'Local supply, practical ordering.',
            'Clear product lists, dependable service.'
          )
        )
      ),
      (
        'images_gallery',
        4,
        jsonb_build_object(
          'heading', 'Images Gallery',
          'images', jsonb_build_array(
            jsonb_build_object(
              'src', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=80',
              'alt', 'Fresh cuts of pork displayed on a wooden preparation surface.'
            ),
            jsonb_build_object(
              'src', 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=1200&q=80',
              'alt', 'Raw whole chickens arranged for market display.'
            ),
            jsonb_build_object(
              'src', 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=1200&q=80',
              'alt', 'Brown eggs grouped in trays on a bright counter.'
            )
          )
        )
      )
  ) as seed(type, sort_order, content)
  join public.page on page.slug = 'home'
)
insert into public.page_section (
  page_id,
  type,
  sort_order,
  content,
  status
)
select
  page_id,
  type,
  sort_order,
  content,
  status
from home_sections
on conflict (page_id, sort_order) do update set
  type = excluded.type,
  content = excluded.content,
  status = excluded.status,
  updated_at = now();
