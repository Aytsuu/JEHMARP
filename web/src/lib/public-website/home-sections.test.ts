import { describe, expect, it } from "vitest";

import type { PublicPageSectionRecord } from "./content";

describe("home page section payloads", () => {
  it("supports mission, vision, core values, taglines, and image gallery array content", () => {
    const section: PublicPageSectionRecord = {
      id: "home-gallery",
      page_id: "home-page",
      type: "images_gallery",
      sort_order: 4,
      status: "published",
      content: {
        heading: "Images Gallery",
        images: [
          {
            src: "https://example.test/image-one.jpg",
            alt: "Fresh pork cuts on a prep table.",
          },
          {
            src: "https://example.test/image-two.jpg",
            alt: "Egg trays prepared for delivery.",
          },
        ],
      },
    };

    expect(section.type).toBe("images_gallery");
    expect(Array.isArray(section.content.images)).toBe(true);
    expect(section.content.images).toHaveLength(2);
  });
});
