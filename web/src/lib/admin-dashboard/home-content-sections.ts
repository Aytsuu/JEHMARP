import { ensureHomeProductCategoryRangeSection } from "@/lib/admin-dashboard/ensure-home-content-sections";
import type { PublicPageContent } from "@/lib/public-website/content";

export async function ensureHomeAdminContentSections(
  content: PublicPageContent,
): Promise<PublicPageContent> {
  if (!content.page || content.page.slug !== "home") {
    return content;
  }

  const productCategoryRange = await ensureHomeProductCategoryRangeSection(content);

  if (!productCategoryRange) {
    return content;
  }

  if (content.sections.some((section) => section.id === productCategoryRange.id)) {
    return content;
  }

  return {
    ...content,
    sections: [...content.sections, productCategoryRange].sort(
      (left, right) => left.sort_order - right.sort_order,
    ),
  };
}
