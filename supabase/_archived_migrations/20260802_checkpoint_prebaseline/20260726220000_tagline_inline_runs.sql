UPDATE public.page_section
SET
  content = jsonb_set(
    content,
    '{items}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(item) = 'string' THEN
              jsonb_build_object(
                'runs',
                jsonb_build_array(
                  jsonb_build_object(
                    'text', item #>> '{}',
                    'fontSize', 'lg',
                    'fontWeight', 600,
                    'italic', false
                  )
                )
              )
            WHEN item ? 'runs' THEN
              item
            WHEN item ? 'html' THEN
              jsonb_build_object(
                'runs',
                jsonb_build_array(
                  jsonb_build_object(
                    'text', regexp_replace(item->>'html', '<[^>]+>', '', 'g'),
                    'fontSize', 'lg',
                    'fontWeight', 600,
                    'italic', false
                  )
                )
              )
            ELSE
              jsonb_build_object(
                'runs',
                jsonb_build_array(
                  jsonb_build_object(
                    'text', COALESCE(item->>'text', ''),
                    'fontSize', COALESCE(item->>'fontSize', 'lg'),
                    'fontWeight', COALESCE((item->>'fontWeight')::int, 600),
                    'italic', COALESCE((item->>'italic')::boolean, false)
                  )
                )
              )
          END
          ORDER BY ordinality
        )
        FROM jsonb_array_elements(content->'items') WITH ORDINALITY AS elements(item, ordinality)
      ),
      '[]'::jsonb
    ),
    true
  ),
  updated_at = '2026-07-26 13:00:00+00'::timestamptz
WHERE type = 'taglines'
  AND content ? 'items'
  AND jsonb_typeof(content->'items') = 'array';
