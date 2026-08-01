INSERT INTO "public"."page_section" (
  "id",
  "page_id",
  "type",
  "sort_order",
  "content",
  "status",
  "created_at",
  "updated_at"
)
VALUES
  (
    'e8c4f2a1-9b3d-4e7f-8c6a-1d5e9f0b2c34'::uuid,
    'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid,
    'why_choose',
    5,
    '{"heading": "Why Choose JEHMARP", "imageSrc": "/images/why_choose_banner.png", "imageAlt": "Why Choose JEHMARP - Prime Cuts & Quality Meat"}'::jsonb,
    'published',
    '2026-07-26 10:00:00+00'::timestamptz,
    '2026-07-26 10:00:00+00'::timestamptz
  )
ON CONFLICT ("id") DO UPDATE SET
  "page_id" = EXCLUDED."page_id",
  "type" = EXCLUDED."type",
  "sort_order" = EXCLUDED."sort_order",
  "content" = EXCLUDED."content",
  "status" = EXCLUDED."status",
  "updated_at" = EXCLUDED."updated_at";
