UPDATE public.page_section
SET
  content = content || jsonb_build_object(
    'slides',
    jsonb_build_array(
      jsonb_build_object(
        'src', '/images/hero_carousel_1.jpg',
        'alt', 'Fresh meat selection at JEHMARP'
      ),
      jsonb_build_object(
        'src', '/images/hero_carousel_2.jpg',
        'alt', 'JEHMARP butcher shop display'
      ),
      jsonb_build_object(
        'src', '/images/hero_carousel_3.jpg',
        'alt', 'Premium cuts prepared at JEHMARP'
      )
    )
  ),
  updated_at = '2026-07-26 11:00:00+00'::timestamptz
WHERE id = '6137229a-94d1-49a7-92e4-4a4c5f5acce9'::uuid
  AND NOT (content ? 'slides');
