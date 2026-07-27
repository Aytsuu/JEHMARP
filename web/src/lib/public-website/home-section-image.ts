import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

export const DEFAULT_ABOUT_IMAGE_SRC = "/images/about_photo.png";
export const DEFAULT_ABOUT_IMAGE_ALT =
  "JEHMARP local meatshop interior and storefront";

export const DEFAULT_WHY_CHOOSE_IMAGE_SRC = "/images/why_choose_banner.png";
export const DEFAULT_WHY_CHOOSE_IMAGE_ALT =
  "Why Choose JEHMARP - Prime Cuts & Quality Meat";

type SectionImageDefaults = {
  imageSrc: string;
  imageAlt: string;
};

export function resolvePageSectionImageSrc(src: string | null | undefined) {
  if (!src) {
    return null;
  }

  return resolvePublicStorageUrl(src) ?? src;
}

function getPageSectionImage(
  content: Record<string, unknown> | undefined,
  defaults: SectionImageDefaults,
) {
  const imageSrc =
    typeof content?.imageSrc === "string" && content.imageSrc.trim().length > 0
      ? content.imageSrc.trim()
      : defaults.imageSrc;
  const imageAlt =
    typeof content?.imageAlt === "string" && content.imageAlt.trim().length > 0
      ? content.imageAlt.trim()
      : defaults.imageAlt;

  return {
    imageSrc,
    imageAlt,
    displaySrc: resolvePageSectionImageSrc(imageSrc) ?? defaults.imageSrc,
  };
}

export function getAboutSectionImage(content: Record<string, unknown> | undefined) {
  return getPageSectionImage(content, {
    imageSrc: DEFAULT_ABOUT_IMAGE_SRC,
    imageAlt: DEFAULT_ABOUT_IMAGE_ALT,
  });
}

export function getWhyChooseSectionImage(
  content: Record<string, unknown> | undefined,
) {
  return getPageSectionImage(content, {
    imageSrc: DEFAULT_WHY_CHOOSE_IMAGE_SRC,
    imageAlt: DEFAULT_WHY_CHOOSE_IMAGE_ALT,
  });
}
