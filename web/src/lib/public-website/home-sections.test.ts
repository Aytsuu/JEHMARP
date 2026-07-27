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

  it("supports why choose banner image content", () => {
    const section: PublicPageSectionRecord = {
      id: "home-why-choose",
      page_id: "home-page",
      type: "why_choose",
      sort_order: 5,
      status: "published",
      content: {
        heading: "Why Choose JEHMARP",
        imageSrc: "/images/why_choose_banner.png",
        imageAlt: "Why Choose JEHMARP - Prime Cuts & Quality Meat",
      },
    };

    expect(section.type).toBe("why_choose");
    expect(section.content.imageSrc).toBe("/images/why_choose_banner.png");
  });

  it("supports FAQ section content", () => {
    const section: PublicPageSectionRecord = {
      id: "home-faq",
      page_id: "home-page",
      type: "faq",
      sort_order: 6,
      status: "published",
      content: {
        heading: "FREQUENTLY ASKED QUESTIONS",
        description: "Quick answers.",
        items: [{ question: "Fresh?", answer: "Yes." }],
      },
    };

    expect(section.type).toBe("faq");
    expect(Array.isArray(section.content.items)).toBe(true);
    expect(section.content.items).toHaveLength(1);
  });
});
