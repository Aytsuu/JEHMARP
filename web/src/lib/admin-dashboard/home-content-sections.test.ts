import { describe, expect, it, vi } from "vitest";

import { ensureHomeAdminContentSections } from "./home-content-sections";
import type { PublicPageContent } from "@/lib/public-website/content";

vi.mock("@/lib/admin-dashboard/ensure-home-content-sections", () => ({
  ensureHomeProductCategoryRangeSection: vi.fn(async (content: PublicPageContent) => {
    if (content.sections.some((section) => section.type === "product_category_range")) {
      return content.sections.find((section) => section.type === "product_category_range") ?? null;
    }

    return {
      id: "b7e2d4f8-1a6c-4f9e-9d2b-8c5a1e3f7b20",
      page_id: content.page?.id ?? "home-page",
      type: "product_category_range",
      sort_order: 7,
      status: "published",
      content: {
        heading: "Our Product Range",
        subtitle: "Subtitle",
        categories: [],
      },
    };
  }),
}));

describe("ensureHomeAdminContentSections", () => {
  it("appends the product category section when missing from home content", async () => {
    const content: PublicPageContent = {
      page: {
        id: "home-page",
        slug: "home",
        title: "Home",
        status: "published",
        published_at: null,
      },
      sections: [
        {
          id: "about",
          page_id: "home-page",
          type: "about",
          sort_order: 1,
          status: "published",
          content: {},
        },
      ],
    };

    const result = await ensureHomeAdminContentSections(content);

    expect(result.sections).toHaveLength(2);
    expect(result.sections.some((section) => section.type === "product_category_range")).toBe(
      true,
    );
  });
});
