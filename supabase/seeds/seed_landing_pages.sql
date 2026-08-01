-- Local-only public-site content seed.
-- This file is applied by `supabase db reset` only; it is never deployed with `supabase db push`.
-- Source checkpoint: 2026-08-02 migration baseline compaction.

-- Source: 20260712180919_seed_landing_pages.sql

INSERT INTO "public"."page" (
  "id",
  "slug",
  "title",
  "status",
  "created_by",
  "updated_by",
  "published_at",
  "created_at",
  "updated_at"
)
VALUES
  ('7085851f-510e-4015-9420-e8d501399471'::uuid, 'business', 'Business', 'published', NULL::uuid, NULL::uuid, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz),
  ('03a23f5e-634b-4954-824e-d2d4117ca60e'::uuid, 'contact', 'Contact', 'published', NULL::uuid, NULL::uuid, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz),
  ('cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid, 'home', 'Home', 'published', NULL::uuid, NULL::uuid, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz),
  ('8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'our-story', 'Our Story', 'published', NULL::uuid, NULL::uuid, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz),
  ('d36f3ffb-5316-49b3-982a-ffa7c8b0c4bc'::uuid, 'shop', 'Shop', 'published', NULL::uuid, NULL::uuid, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz, '2026-07-12 18:08:37.885185+00'::timestamptz)
ON CONFLICT ("id") DO UPDATE SET
  "slug" = EXCLUDED."slug",
  "title" = EXCLUDED."title",
  "status" = EXCLUDED."status",
  "created_by" = EXCLUDED."created_by",
  "updated_by" = EXCLUDED."updated_by",
  "published_at" = EXCLUDED."published_at",
  "created_at" = EXCLUDED."created_at",
  "updated_at" = EXCLUDED."updated_at";

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
  ('3fbd6789-c58e-4881-9a14-89a2342f74c0'::uuid, '03a23f5e-634b-4954-824e-d2d4117ca60e'::uuid, 'contact_details', 0, '{"email": "jehmarp2020@gmail.com", "phone": "09322159289 | 09177770118", "heading": "Contact details", "location": "Compostela Public Market | Consolacion Public Market", "storeHours": "Open Daily (3:00AM - 8:00PM)"}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('b6fce5ac-5bc7-4b44-83fc-b09d4d854115'::uuid, '03a23f5e-634b-4954-824e-d2d4117ca60e'::uuid, 'ordering_note', 1, '{"heading": "Ordering note", "summary": "Guest orders can be submitted from the shop page for review and confirmation by the JEHMARP team.", "responseWindow": "Store hours: Open Daily (3:00AM - 8:00PM)"}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('c2e9d361-ac8f-4b45-85c6-1617f5b7ad47'::uuid, '7085851f-510e-4015-9420-e8d501399471'::uuid, 'reseller_placeholder', 0, '{"heading": "Business inquiries", "summary": "Temporary business page copy. The reseller application workflow is implemented in a later phase.", "priceList": "Reseller price-list sending is not active in this mock content."}'::jsonb, 'published', '2026-07-12 18:08:38.137424+00'::timestamptz, '2026-07-12 18:08:38.137424+00'::timestamptz),
  ('4c7e7b43-e7a2-495f-b31e-56fd92bc2c78'::uuid, '8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'intro', 0, '{"heading": "Our Story", "summary": "JeHMarP Meatshop is not just a business - it is a story of faith, family, and experience passed from one generation to another."}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('107a09bf-b13f-4a7e-aa6c-819f7160e6d4'::uuid, '8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'heritage', 1, '{"heading": "More Than 20 Years", "summary": "For more than 20 years, our family has been deeply rooted in the meat industry. It all started with a mother figure who dedicated her life to selling meat in the public market - building trust, ensuring quality, and serving the community with honesty."}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('8059c45c-789a-49e6-8ff2-1f453c726344'::uuid, '8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'next_generation', 2, '{"heading": "The Next Generation", "summary": "As time passed, this responsibility was continued by the next generation - strengthening the foundation of knowledge, experience, and customer relationships."}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('2311e769-943f-4ce0-9da4-aef4acc019ba'::uuid, '8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'turning_point', 3, '{"heading": "The Turning Point", "summary": "At the same time, we began raising hogs ourselves. This became the turning point. It was here that JeHMarP was born."}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('917f71f3-958c-4ac0-a1bb-fd16333ff43f'::uuid, '8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'name_meaning', 4, $json${"heading": "What JeHMarP Means", "summary": "The name represents not just a business, but the people behind it - \"Jesus Helps Mary's People\" - a reminder that this journey is guided by faith and strengthened by the farmers, partners, and community who are part of it."}$json$::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('9e7c7156-1c19-48a8-bda7-c21c40744721'::uuid, '8f8d9afb-9337-4063-aa1e-97a9d6cf3e6e'::uuid, 'today', 5, '{"heading": "Today", "summary": "Today, JeHMarP continues to grow - from hog raising to meat retail - bringing fresh, quality pork directly from farm to table."}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('6137229a-94d1-49a7-92e4-4a4c5f5acce9'::uuid, 'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid, 'hero', 0, '{"heading": "FROM FARM TO TABLE"}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.305348+00'::timestamptz),
  ('f7e8d4df-a9c8-4d77-8640-748a24537455'::uuid, 'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid, 'about', 1, $json${"body": "Established in 2020, JeHMarP Meatshop is built on a rich, 20-year family legacy rooted deeply in the meat industry. What began with a dedicated mother figure selling meat in the public market has evolved into a multi-generational, family-run business that handles everything from raising hogs to retail distribution. The name JeHMarP stands for \"Jesus Helps Mary's People\" - a constant reminder that our journey is guided by faith and strengthened by our community. Today, we work hand-in-hand with local farmers to deliver top-notch, custom-cut fresh pork and chicken daily to families in Compostela and Consolacion. With every purchase, you are not just getting guaranteed freshness and honest pricing; you are supporting local agriculture and community livelihoods.", "heading": "THE MEATSHOP", "summary": "From Farm to Table, Guided by Faith and Family"}$json$::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('2071dd66-7c79-452a-bdbf-88027abf29c3'::uuid, 'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid, 'mission_vision_core_values', 2, $json${"vision": "To be the community's premier, multi-generational farm-to-table partner, delivering top-notch freshness, quality, and safety you can trust, while continually lifting up local agriculture and community livelihoods with every purchase.", "heading": "Mission, Vision, and Core Values", "mission": "Provide fresh meat daily to our customers. Support local farmers and hog raisers to strengthen local agriculture. Serve families with honesty, dedication, and care. Maintain affordable, budget-friendly pricing for every family.", "coreValues": "We are a multi-generational, family-run business built on faith, family ties, and a journey guided by spiritual purpose (\"Jesus Helps Mary's People\"). We are committed to offering premium, quality meats at budget-friendly rates so every family has access to great food. We serve customers and partners with genuine transparency, honest practices, and deep-rooted dedication. We ensure a daily supply of carefully handled, clean, safe, and strictly inspected fresh meat. We actively support local hog raisers, hometown livelihoods, and the community that has sustained us."}$json$::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('0f99f0c8-c846-4217-a289-ce643d9c1c49'::uuid, 'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid, 'taglines', 3, '{"items": [{"runs": [{"text": "Fresh - Quality - Trusted", "fontSize": "lg", "fontWeight": 600, "italic": false}]}, {"runs": [{"text": "From farmers to Families -", "fontSize": "lg", "fontWeight": 600, "italic": false}, {"text": "Quality You Can Trust", "fontSize": "lg", "fontWeight": 600, "italic": true}]}], "heading": "Taglines"}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz),
  ('9f78825f-6d4f-4b97-bf36-8b2f768ebcdb'::uuid, 'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid, 'images_gallery', 4, '{"images": [{"alt": "JEHMARP meatshop team and fresh meat preparation.", "src": "/images/about_photo.png"}, {"alt": "Fresh pork belly cuts prepared for customers.", "src": "/images/pork_belly.png"}, {"alt": "Fresh chicken breast cuts available at JEHMARP.", "src": "/images/chicken_breast.png"}], "heading": "Images Gallery"}'::jsonb, 'published', '2026-07-12 18:08:38.297081+00'::timestamptz, '2026-07-12 18:08:38.297081+00'::timestamptz)
ON CONFLICT ("id") DO UPDATE SET
  "page_id" = EXCLUDED."page_id",
  "type" = EXCLUDED."type",
  "sort_order" = EXCLUDED."sort_order",
  "content" = EXCLUDED."content",
  "status" = EXCLUDED."status",
  "created_at" = EXCLUDED."created_at",
  "updated_at" = EXCLUDED."updated_at";


-- Source: 20260726180000_seed_home_why_choose_section.sql

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


-- Source: 20260726190000_seed_home_hero_slides.sql

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


-- Source: 20260726220000_tagline_inline_runs.sql

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


-- Source: 20260726230000_seed_home_faq_section.sql

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
    'a4f8c1d2-6e7b-4a9f-9c3d-2b1e8f5a6d70'::uuid,
    'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid,
    'faq',
    6,
    $json${
      "heading": "FREQUENTLY ASKED QUESTIONS",
      "description": "Find quick answers to common questions about our fresh meat cuts, ordering process, and pickup/delivery options.",
      "items": [
        {
          "question": "Is the meat fresh or frozen?",
          "answer": "Fresh cuts are prepared daily and packed on-site for the day's orders."
        },
        {
          "question": "Do you accept custom cuts?",
          "answer": "Yes. You can request preferred thickness, portioning, and preparation when ordering."
        },
        {
          "question": "Can I order in bulk?",
          "answer": "Yes. Family packs, party orders, and business quantities can be arranged ahead of time."
        },
        {
          "question": "Do you offer pickup and delivery?",
          "answer": "Pickup is supported directly, and delivery can be coordinated based on your area."
        }
      ]
    }$json$::jsonb,
    'published',
    '2026-07-26 15:00:00+00'::timestamptz,
    '2026-07-26 15:00:00+00'::timestamptz
  )
ON CONFLICT ("id") DO UPDATE SET
  "page_id" = EXCLUDED."page_id",
  "type" = EXCLUDED."type",
  "sort_order" = EXCLUDED."sort_order",
  "content" = EXCLUDED."content",
  "status" = EXCLUDED."status",
  "updated_at" = EXCLUDED."updated_at";


-- Source: 20260801160000_seed_home_product_category_range.sql

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
    'b7e2d4f8-1a6c-4f9e-9d2b-8c5a1e3f7b20'::uuid,
    'cbbe5f4d-7ce5-4d84-90fe-020735a7fc50'::uuid,
    'product_category_range',
    7,
    $json${
      "heading": "Our Product Range",
      "subtitle": "At JEHMARP, we have a wide variety of options to suit different cooking styles and preferences. Our collection includes:",
      "categories": [
        {
          "key": "chicken",
          "tag": "Fresh & Local Cut",
          "title": "Chicken",
          "description": "From fresh whole chicken to prime cuts, ideal for daily family meals.",
          "imageSrc": "/images/chicken_breast.png",
          "imageAlt": "Fresh Chicken Cuts",
          "shopCategory": "chicken"
        },
        {
          "key": "pork",
          "tag": "Premium Choice Cut",
          "title": "Pork",
          "description": "Juicy belly, chops, and ground pork carefully prepared for any recipe.",
          "imageSrc": "/images/pork_belly.png",
          "imageAlt": "Premium Pork Cuts",
          "shopCategory": "pork"
        },
        {
          "key": "egg",
          "tag": "Farm Fresh Daily",
          "title": "Egg",
          "description": "Nutrient-rich, farm-fresh eggs gathered daily for top quality & taste.",
          "imageSrc": "/images/fresh_eggs.png",
          "imageAlt": "Farm Fresh Eggs",
          "shopCategory": "egg"
        }
      ]
    }$json$::jsonb,
    'published',
    '2026-08-01 16:00:00+00'::timestamptz,
    '2026-08-01 16:00:00+00'::timestamptz
  )
ON CONFLICT ("id") DO UPDATE SET
  "page_id" = EXCLUDED."page_id",
  "type" = EXCLUDED."type",
  "sort_order" = EXCLUDED."sort_order",
  "content" = EXCLUDED."content",
  "status" = EXCLUDED."status",
  "updated_at" = EXCLUDED."updated_at";


