import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ABOUT_IMAGE_ALT,
  DEFAULT_ABOUT_IMAGE_SRC,
  DEFAULT_WHY_CHOOSE_IMAGE_ALT,
  DEFAULT_WHY_CHOOSE_IMAGE_SRC,
  getAboutSectionImage,
  getWhyChooseSectionImage,
} from "./home-section-image";

describe("getAboutSectionImage", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("LOCAL_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("LOCAL_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  });
  it("falls back to the default about image when content is missing", () => {
    expect(getAboutSectionImage(undefined)).toEqual({
      imageSrc: DEFAULT_ABOUT_IMAGE_SRC,
      imageAlt: DEFAULT_ABOUT_IMAGE_ALT,
      displaySrc: DEFAULT_ABOUT_IMAGE_SRC,
    });
  });

  it("uses custom image and alt values from section content", () => {
    expect(
      getAboutSectionImage({
        imageSrc: "page-sections/about-custom.jpg",
        imageAlt: "Updated storefront photo",
      }),
    ).toEqual({
      imageSrc: "page-sections/about-custom.jpg",
      imageAlt: "Updated storefront photo",
      displaySrc: expect.stringContaining("page-sections/about-custom.jpg"),
    });
  });
});

describe("getWhyChooseSectionImage", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("LOCAL_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("LOCAL_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  });

  it("falls back to the default why choose image when content is missing", () => {
    expect(getWhyChooseSectionImage(undefined)).toEqual({
      imageSrc: DEFAULT_WHY_CHOOSE_IMAGE_SRC,
      imageAlt: DEFAULT_WHY_CHOOSE_IMAGE_ALT,
      displaySrc: DEFAULT_WHY_CHOOSE_IMAGE_SRC,
    });
  });

  it("uses custom image and alt values from section content", () => {
    expect(
      getWhyChooseSectionImage({
        imageSrc: "page-sections/why-choose-custom.jpg",
        imageAlt: "Updated banner photo",
      }),
    ).toEqual({
      imageSrc: "page-sections/why-choose-custom.jpg",
      imageAlt: "Updated banner photo",
      displaySrc: expect.stringContaining("page-sections/why-choose-custom.jpg"),
    });
  });
});
