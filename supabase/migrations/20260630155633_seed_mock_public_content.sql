with mock_sections as (
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
          'heading', 'Fresh farm products for local tables',
          'summary', 'Temporary mock home content. Replace this with final homepage copy later.',
          'primaryAction', 'Browse the shop',
          'secondaryAction', 'Learn our story'
        )
      ),
      (
        'home',
        'market_note',
        1,
        jsonb_build_object(
          'heading', 'Current public market note',
          'summary', 'Pork, chicken, and egg listings below are mock records for layout testing.',
          'availability', 'Orders are accepted for admin review.'
        )
      ),
      (
        'our-story',
        'intro',
        0,
        jsonb_build_object(
          'heading', 'A local supply story',
          'summary', 'Temporary story content describing a dependable neighborhood meat and egg supply.',
          'note', 'This section exists only so the public page can render real database content.'
        )
      ),
      (
        'our-story',
        'values',
        1,
        jsonb_build_object(
          'heading', 'What we care about',
          'quality', 'Clear product handling',
          'service', 'Simple ordering',
          'community', 'Reliable local supply'
        )
      ),
      (
        'contact',
        'contact_details',
        0,
        jsonb_build_object(
          'heading', 'Contact details',
          'phone', '0917 000 0000',
          'email', 'hello@example.test',
          'address', 'Temporary NMC public address'
        )
      ),
      (
        'contact',
        'ordering_note',
        1,
        jsonb_build_object(
          'heading', 'Ordering note',
          'summary', 'For now, guest orders are submitted from the shop page and reviewed before processing.',
          'responseWindow', 'Mock response window: within one business day'
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
from mock_sections
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
      'Mock Pork Belly',
      'pork',
      'Temporary product for testing the public shop layout and guest order form.',
      'kg',
      360.00,
      330.00,
      'in_stock'
    ),
    (
      'Mock Chicken Whole',
      'chicken',
      'Temporary whole chicken listing for category and price filtering.',
      'kg',
      210.00,
      190.00,
      'limited'
    ),
    (
      'Mock Brown Eggs Tray',
      'egg',
      'Temporary egg tray listing for the public product grid.',
      'tray',
      220.00,
      200.00,
      'in_stock'
    ),
    (
      'Mock Pork Kasim',
      'pork',
      'Temporary pork kasim listing to exercise pagination and sorting.',
      'kg',
      320.00,
      295.00,
      'out_of_stock'
    )
) as seed(name, category, description, unit_label, default_price, reseller_price, stock_status)
where not exists (
  select 1
  from public.product
  where product.name = seed.name
);
