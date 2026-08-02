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
