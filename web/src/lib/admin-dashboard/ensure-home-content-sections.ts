import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildDefaultProductCategoryRangeContent,
  HOME_PRODUCT_CATEGORY_RANGE_SECTION_ID,
  HOME_PRODUCT_CATEGORY_RANGE_SORT_ORDER,
} from "@/lib/public-website/home-product-categories";
import {
  invalidatePublicPageContentCacheForPage,
  type PublicPageContent,
  type PublicPageSectionRecord,
} from "@/lib/public-website/content";

export async function ensureHomeProductCategoryRangeSection(
  content: PublicPageContent,
): Promise<PublicPageSectionRecord | null> {
  if (!content.page) {
    return null;
  }

  const existing = content.sections.find(
    (section) => section.type === "product_category_range",
  );

  if (existing) {
    return existing;
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload = {
    id: HOME_PRODUCT_CATEGORY_RANGE_SECTION_ID,
    page_id: content.page.id,
    type: "product_category_range",
    sort_order: HOME_PRODUCT_CATEGORY_RANGE_SORT_ORDER,
    content: buildDefaultProductCategoryRangeContent(),
    status: "published" as const,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("page_section")
    .upsert(payload, { onConflict: "id" })
    .select("id, page_id, type, sort_order, content, status")
    .single();

  if (error || !data) {
    console.error("Unable to ensure home product category range section", error);
    return null;
  }

  await invalidatePublicPageContentCacheForPage(content.page.id);

  return data as PublicPageSectionRecord;
}
