with seeded_sections as (
  select
    page.id as page_id,
    seed.type,
    seed.sort_order,
    seed.content,
    'published'::text as status
  from (
    values
      (
        'home',
        'hero',
        0,
        jsonb_build_object(
          'heading', 'FROM FARM TO TABLE'
        )
      ),
      (
        'home',
        'about',
        1,
        jsonb_build_object(
          'heading', 'THE MEATSHOP',
          'summary', 'From Farm to Table, Guided by Faith and Family',
          'body', 'Established in 2020, JeHMarP Meatshop is built on a rich, 20-year family legacy rooted deeply in the meat industry. What began with a dedicated mother figure selling meat in the public market has evolved into a multi-generational, family-run business that handles everything from raising hogs to retail distribution. The name JeHMarP stands for "Jesus Helps Mary''s People" - a constant reminder that our journey is guided by faith and strengthened by our community. Today, we work hand-in-hand with local farmers to deliver top-notch, custom-cut fresh pork and chicken daily to families in Compostela and Consolacion. With every purchase, you are not just getting guaranteed freshness and honest pricing; you are supporting local agriculture and community livelihoods.'
        )
      ),
      (
        'home',
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
        'home',
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
        'home',
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
      ),
      (
        'our-story',
        'intro',
        0,
        jsonb_build_object(
          'heading', 'Our Story',
          'summary', 'JeHMarP Meatshop is not just a business - it is a story of faith, family, and experience passed from one generation to another.'
        )
      ),
      (
        'our-story',
        'heritage',
        1,
        jsonb_build_object(
          'heading', 'More Than 20 Years',
          'summary', 'For more than 20 years, our family has been deeply rooted in the meat industry. It all started with a mother figure who dedicated her life to selling meat in the public market - building trust, ensuring quality, and serving the community with honesty.'
        )
      ),
      (
        'our-story',
        'next_generation',
        2,
        jsonb_build_object(
          'heading', 'The Next Generation',
          'summary', 'As time passed, this responsibility was continued by the next generation - strengthening the foundation of knowledge, experience, and customer relationships.'
        )
      ),
      (
        'our-story',
        'turning_point',
        3,
        jsonb_build_object(
          'heading', 'The Turning Point',
          'summary', 'At the same time, we began raising hogs ourselves. This became the turning point. It was here that JeHMarP was born.'
        )
      ),
      (
        'our-story',
        'name_meaning',
        4,
        jsonb_build_object(
          'heading', 'What JeHMarP Means',
          'summary', 'The name represents not just a business, but the people behind it - "Jesus Helps Mary''s People" - a reminder that this journey is guided by faith and strengthened by the farmers, partners, and community who are part of it.'
        )
      ),
      (
        'our-story',
        'today',
        5,
        jsonb_build_object(
          'heading', 'Today',
          'summary', 'Today, JeHMarP continues to grow - from hog raising to meat retail - bringing fresh, quality pork directly from farm to table.'
        )
      ),
      (
        'contact',
        'contact_details',
        0,
        jsonb_build_object(
          'heading', 'Contact details',
          'phone', '09322159289 | 09177770118',
          'email', 'jehmarp2020@gmail.com',
          'location', 'Compostela Public Market | Consolacion Public Market',
          'storeHours', 'Open Daily (3:00AM - 8:00PM)'
        )
      ),
      (
        'contact',
        'ordering_note',
        1,
        jsonb_build_object(
          'heading', 'Ordering note',
          'summary', 'Guest orders can be submitted from the shop page for review and confirmation by the JEHMARP team.',
          'responseWindow', 'Store hours: Open Daily (3:00AM - 8:00PM)'
        )
      ),
      (
        'business',
        'reseller_placeholder',
        0,
        jsonb_build_object(
          'heading', 'Business inquiries',
          'summary', 'Temporary business page copy. The reseller application workflow is implemented in a later phase.',
          'priceList', 'Reseller price-list sending is not active in this mock content.'
        )
      )
  ) as seed(slug, type, sort_order, content)
  join public.page on page.slug = seed.slug
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
from seeded_sections
on conflict (page_id, sort_order) do update set
  type = excluded.type,
  content = excluded.content,
  status = excluded.status,
  updated_at = now();
insert into public.product (
  name,
  category,
  description,
  unit_label,
  default_price,
  reseller_price,
  stock_status,
  is_active
)
select
  seed.name,
  seed.category,
  seed.description,
  seed.unit_label,
  seed.default_price,
  seed.reseller_price,
  seed.stock_status,
  true
from (
  values
    (
      'Pork Belly',
      'pork',
      'Fresh pork belly cut prepared daily for grilling, braising, and family meals.',
      'kg',
      360.00,
      340.00,
      'in_stock'
    ),
    (
      'Shoulder Ribs',
      'pork',
      'Pork shoulder ribs cut for soup stock, braising, and everyday cooking.',
      'kg',
      300.00,
      280.00,
      'in_stock'
    ),
    (
      'Pork Shoulder',
      'pork',
      'Fresh pork shoulder prepared for stew, roasting, and bulk home cooking.',
      'kg',
      320.00,
      300.00,
      'in_stock'
    ),
    (
      'Front Leg',
      'pork',
      'Front leg pork cut cleaned and portioned for slow-cooked dishes and soups.',
      'kg',
      310.00,
      290.00,
      'in_stock'
    ),
    (
      'Tenderloin',
      'pork',
      'Lean pork tenderloin suitable for quick frying, roasting, and marinated cuts.',
      'kg',
      380.00,
      360.00,
      'limited'
    ),
    (
      'Riblets',
      'pork',
      'Pork riblets prepared for grilling, adobo, and savory soups.',
      'kg',
      290.00,
      270.00,
      'in_stock'
    ),
    (
      'Porkchop',
      'pork',
      'Classic porkchop cuts cleaned and portioned for frying and grilling.',
      'kg',
      340.00,
      320.00,
      'in_stock'
    ),
    (
      'Pork Bones',
      'pork',
      'Pork bones selected for broth, soup base, and home stock preparation.',
      'kg',
      180.00,
      160.00,
      'in_stock'
    ),
    (
      'Ground Pork',
      'pork',
      'Freshly ground pork for lumpia, meatballs, patties, and everyday cooking.',
      'kg',
      295.00,
      275.00,
      'in_stock'
    ),
    (
      'Pork Head',
      'pork',
      'Pork head cuts prepared for specialty dishes and custom market orders.',
      'kg',
      230.00,
      210.00,
      'limited'
    ),
    (
      'Sisig Cut',
      'pork',
      'Prepared pork sisig cut for sizzling dishes and seasoned chopped recipes.',
      'kg',
      260.00,
      240.00,
      'in_stock'
    ),
    (
      'Chicken Breast',
      'chicken',
      'Fresh chicken breast cut for lean meals, fillets, and bulk family cooking.',
      'kg',
      245.00,
      225.00,
      'in_stock'
    ),
    (
      'Chicken Wings',
      'chicken',
      'Fresh chicken wings cleaned and portioned for frying, grilling, and party trays.',
      'kg',
      220.00,
      205.00,
      'in_stock'
    ),
    (
      'Chicken Thighs',
      'chicken',
      'Chicken thighs prepared daily for flavorful roasting, frying, and stews.',
      'kg',
      215.00,
      200.00,
      'in_stock'
    ),
    (
      'Chicken Feet',
      'chicken',
      'Chicken feet cleaned and ready for soups, braises, and specialty dishes.',
      'kg',
      120.00,
      110.00,
      'limited'
    ),
    (
      'Chicken Chop',
      'chicken',
      'Mixed chicken chop portions prepared for practical family meals and curry dishes.',
      'kg',
      195.00,
      180.00,
      'in_stock'
    ),
    (
      'Chicken Neck',
      'chicken',
      'Chicken neck cuts prepared for soup stock, adobo, and value cooking.',
      'kg',
      95.00,
      85.00,
      'in_stock'
    ),
    (
      'Chicken Bones',
      'chicken',
      'Chicken bones for broth, soup base, and home stock preparation.',
      'kg',
      70.00,
      60.00,
      'in_stock'
    ),
    (
      'Chicken Skin',
      'chicken',
      'Chicken skin prepared for crispy frying, rendering, and specialty recipes.',
      'kg',
      110.00,
      100.00,
      'limited'
    ),
    (
      'Chicken Breast Fillet',
      'chicken',
      'Trimmed chicken breast fillet suited for quick cooking and ready-to-season meals.',
      'kg',
      255.00,
      235.00,
      'in_stock'
    ),
    (
      'Chicken Leg Quarter',
      'chicken',
      'Leg quarter chicken portions prepared for grilling, roasting, and budget packs.',
      'kg',
      185.00,
      170.00,
      'in_stock'
    )
) as seed(name, category, description, unit_label, default_price, reseller_price, stock_status)
where not exists (
  select 1
  from public.product
  where product.name = seed.name
);
