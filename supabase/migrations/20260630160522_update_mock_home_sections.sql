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
          'heading', 'FROM FARM TO TABLE'
        )
      ),
      (
        'about',
        1,
        jsonb_build_object(
          'heading', 'THE MEATSHOP',
          'summary', 'From Farm to Table, Guided by Faith and Family',
          'body', 'Established in 2020, JeHMarP Meatshop is built on a rich, 20-year family legacy rooted deeply in the meat industry. What began with a dedicated mother figure selling meat in the public market has evolved into a multi-generational, family-run business that handles everything from raising hogs to retail distribution. The name JeHMarP stands for "Jesus Helps Mary''s People" - a constant reminder that our journey is guided by faith and strengthened by our community. Today, we work hand-in-hand with local farmers to deliver top-notch, custom-cut fresh pork and chicken daily to families in Compostela and Consolacion. With every purchase, you are not just getting guaranteed freshness and honest pricing; you are supporting local agriculture and community livelihoods.'
        )
      ),
      (
        'mission_vision_core_values',
        2,
        jsonb_build_object(
          'heading', 'Mission, Vision, and Core Values',
          'mission', 'Provide fresh meat daily to our customers. Support local farmers and hog raisers to strengthen local agriculture. Serve families with honesty, dedication, and care. Maintain affordable, budget-friendly pricing for every family.',
          'vision', 'To be the community''s premier, multi-generational farm-to-table partner, delivering top-notch freshness, quality, and safety you can trust, while continually lifting up local agriculture and community livelihoods with every purchase.',
          'coreValues', jsonb_build_array(
            'F - Family & Faith: A multi-generational, family-run business built on a foundation of faith, family ties, and a journey guided by spiritual purpose ("Jesus Helps Mary''s People").',
            'A - Affordable & Fair Pricing: Committed to offering premium, quality meats at budget-friendly rates so every family has access to great food.',
            'I - Integrity & Honesty: Serving our customers and partners with genuine transparency, honest practices, and deep-rooted dedication.',
            'T - Top-Notch Freshness: Ensuring a daily supply of carefully handled, clean, safe, and strictly inspected fresh meat.',
            'H - Hometown & Community-Centered: Actively backing local hog raisers, supporting hometown livelihoods, and giving back to the community that has sustained us.'
          )
        )
      ),
      (
        'taglines',
        3,
        jsonb_build_object(
          'heading', 'Taglines',
          'items', jsonb_build_array(
            'Fresh - Quality - Trusted',
            'From farmers to Families -Quality You Can Trust'
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
              'src', '/images/about_photo.png',
              'alt', 'JEHMARP meatshop team and fresh meat preparation.'
            ),
            jsonb_build_object(
              'src', '/images/pork_belly.png',
              'alt', 'Fresh pork belly cuts prepared for customers.'
            ),
            jsonb_build_object(
              'src', '/images/chicken_breast.png',
              'alt', 'Fresh chicken breast cuts available at JEHMARP.'
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
