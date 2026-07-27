import { resolvePageSectionImageSrc } from "@/lib/public-website/home-section-image";

export type HeroSlide = {
  src: string;
  alt: string;
};

export type HeroSlideView = HeroSlide & {
  displaySrc: string;
};

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    src: "/images/hero_carousel_1.jpg",
    alt: "Fresh meat selection at JEHMARP",
  },
  {
    src: "/images/hero_carousel_2.jpg",
    alt: "JEHMARP butcher shop display",
  },
  {
    src: "/images/hero_carousel_3.jpg",
    alt: "Premium cuts prepared at JEHMARP",
  },
];

export const HERO_SLIDE_NEW_MARKER = "__NEW__";

export function parseHeroSlidesEditorPayload(value: unknown): HeroSlide[] {
  if (!Array.isArray(value)) {
    throw new Error("Slides must be an array.");
  }

  const slides = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const rawSrc = typeof record.src === "string" ? record.src.trim() : "";
    const alt =
      typeof record.alt === "string" && record.alt.trim().length > 0
        ? record.alt.trim()
        : "Hero slide image";

    if (!rawSrc || rawSrc === HERO_SLIDE_NEW_MARKER) {
      return [{ src: HERO_SLIDE_NEW_MARKER, alt }];
    }

    return [{ src: rawSrc, alt }];
  });

  if (slides.length === 0) {
    throw new Error("At least one hero slide is required.");
  }

  return slides;
}

export function collectRemovedHeroSlideSrcs(
  previousSlides: unknown,
  nextSlides: HeroSlide[],
): string[] {
  const previous = normalizeHeroSlides(previousSlides);
  const nextSrcs = new Set(
    nextSlides
      .map((slide) => slide.src)
      .filter((src) => src !== HERO_SLIDE_NEW_MARKER),
  );

  return previous
    .map((slide) => slide.src)
    .filter((src) => !nextSrcs.has(src));
}

export function normalizeHeroSlides(value: unknown): HeroSlide[] {
  if (!Array.isArray(value)) {
    return DEFAULT_HERO_SLIDES.map((slide) => ({ ...slide }));
  }

  const slides = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const src =
      typeof record.src === "string" && record.src.trim().length > 0
        ? record.src.trim()
        : null;
    const alt =
      typeof record.alt === "string" && record.alt.trim().length > 0
        ? record.alt.trim()
        : "Hero slide image";

    return src ? [{ src, alt }] : [];
  });

  if (slides.length === 0) {
    return DEFAULT_HERO_SLIDES.map((slide) => ({ ...slide }));
  }

  return slides;
}

export function getHeroSlides(
  content: Record<string, unknown> | undefined,
): HeroSlideView[] {
  return normalizeHeroSlides(content?.slides).map((slide) => ({
    ...slide,
    displaySrc: resolvePageSectionImageSrc(slide.src) ?? slide.src,
  }));
}

export function createDefaultHeroSlide(): HeroSlide {
  return { ...DEFAULT_HERO_SLIDES[0] };
}

export function updateHeroSlideAlt(
  content: Record<string, unknown>,
  slideIndex: number,
  alt: string,
): Record<string, unknown> {
  const slides = normalizeHeroSlides(content.slides);

  if (slideIndex < 0 || slideIndex >= slides.length) {
    throw new Error("Slide index is invalid.");
  }

  slides[slideIndex] = {
    ...slides[slideIndex],
    alt,
  };

  return {
    ...content,
    slides,
  };
}

export function addHeroSlide(
  content: Record<string, unknown>,
): Record<string, unknown> {
  const slides = normalizeHeroSlides(content.slides);

  return {
    ...content,
    slides: [...slides, createDefaultHeroSlide()],
  };
}

export function deleteHeroSlide(
  content: Record<string, unknown>,
  slideIndex: number,
): { content: Record<string, unknown>; removedSlide: HeroSlide } {
  const slides = normalizeHeroSlides(content.slides);

  if (slides.length <= 1) {
    throw new Error("At least one hero slide is required.");
  }

  if (slideIndex < 0 || slideIndex >= slides.length) {
    throw new Error("Slide index is invalid.");
  }

  const removedSlide = slides[slideIndex];

  return {
    content: {
      ...content,
      slides: slides.filter((_, index) => index !== slideIndex),
    },
    removedSlide,
  };
}

export function deleteHeroSlideBySrc(
  content: Record<string, unknown>,
  slideSrc: string,
): { content: Record<string, unknown>; removedSlide: HeroSlide } {
  const normalizedSrc = slideSrc.trim();

  if (!normalizedSrc) {
    throw new Error("Slide source is required.");
  }

  const slides = normalizeHeroSlides(content.slides);
  const slideIndex = slides.findIndex((slide) => slide.src === normalizedSrc);

  if (slideIndex < 0) {
    throw new Error("Slide source is invalid.");
  }

  return deleteHeroSlide(content, slideIndex);
}

export function updateHeroSlideImage(
  content: Record<string, unknown>,
  slideIndex: number,
  src: string,
): { content: Record<string, unknown>; previousSrc: string | null } {
  const slides = normalizeHeroSlides(content.slides);

  if (slideIndex < 0 || slideIndex >= slides.length) {
    throw new Error("Slide index is invalid.");
  }

  const previousSrc = slides[slideIndex]?.src ?? null;
  slides[slideIndex] = {
    ...slides[slideIndex],
    src,
  };

  return {
    content: {
      ...content,
      slides,
    },
    previousSrc,
  };
}
