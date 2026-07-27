import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HERO_SLIDES,
  addHeroSlide,
  collectRemovedHeroSlideSrcs,
  deleteHeroSlide,
  deleteHeroSlideBySrc,
  getHeroSlides,
  normalizeHeroSlides,
  parseHeroSlidesEditorPayload,
  updateHeroSlideAlt,
  updateHeroSlideImage,
} from "./home-hero-slides";

describe("home hero slides", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("LOCAL_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("LOCAL_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  });

  it("falls back to default slides when content is missing", () => {
    expect(getHeroSlides(undefined)).toHaveLength(DEFAULT_HERO_SLIDES.length);
    expect(getHeroSlides(undefined)[0]?.src).toBe(DEFAULT_HERO_SLIDES[0]?.src);
  });

  it("normalizes stored slide content", () => {
    expect(
      normalizeHeroSlides([
        { src: "page-sections/hero-1.jpg", alt: "Custom slide" },
        { src: "", alt: "Ignored" },
      ]),
    ).toEqual([{ src: "page-sections/hero-1.jpg", alt: "Custom slide" }]);
  });

  it("adds and deletes slides while keeping at least one slide", () => {
    const base = { heading: "FROM FARM TO TABLE", slides: DEFAULT_HERO_SLIDES };
    const added = addHeroSlide(base);
    expect(normalizeHeroSlides(added.slides)).toHaveLength(4);

    const deleted = deleteHeroSlide(added, 2);
    expect(normalizeHeroSlides(deleted.content.slides)).toHaveLength(3);
    expect(deleted.removedSlide.src).toBe(DEFAULT_HERO_SLIDES[2]?.src);

    expect(() => deleteHeroSlide({ slides: [DEFAULT_HERO_SLIDES[0]] }, 0)).toThrow(
      "At least one hero slide is required.",
    );
  });

  it("deletes a slide by src", () => {
    const base = { heading: "FROM FARM TO TABLE", slides: DEFAULT_HERO_SLIDES };
    const deleted = deleteHeroSlideBySrc(base, DEFAULT_HERO_SLIDES[1]?.src ?? "");

    expect(normalizeHeroSlides(deleted.content.slides)).toHaveLength(2);
    expect(deleted.removedSlide.src).toBe(DEFAULT_HERO_SLIDES[1]?.src);
    expect(
      normalizeHeroSlides(deleted.content.slides).some(
        (slide) => slide.src === DEFAULT_HERO_SLIDES[1]?.src,
      ),
    ).toBe(false);
  });

  it("updates slide alt text and image src", () => {
    const base = { slides: DEFAULT_HERO_SLIDES };
    const withAlt = updateHeroSlideAlt(base, 1, "Updated alt text");
    expect(normalizeHeroSlides(withAlt.slides)[1]?.alt).toBe("Updated alt text");

    const withImage = updateHeroSlideImage(base, 0, "page-sections/new-hero.jpg");
    expect(normalizeHeroSlides(withImage.content.slides)[0]?.src).toBe(
      "page-sections/new-hero.jpg",
    );
    expect(withImage.previousSrc).toBe(DEFAULT_HERO_SLIDES[0]?.src);
  });

  it("parses editor slide payloads and tracks removed slide src values", () => {
    expect(
      parseHeroSlidesEditorPayload([
        { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
        { src: "__NEW__", alt: "Slide 2" },
      ]),
    ).toEqual([
      { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
      { src: "__NEW__", alt: "Slide 2" },
    ]);

    expect(
      collectRemovedHeroSlideSrcs(
        DEFAULT_HERO_SLIDES,
        [{ src: "/images/hero_carousel_1.jpg", alt: "Slide 1" }],
      ),
    ).toEqual([
      "/images/hero_carousel_2.jpg",
      "/images/hero_carousel_3.jpg",
    ]);
  });
});
