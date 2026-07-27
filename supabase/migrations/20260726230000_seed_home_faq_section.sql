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
