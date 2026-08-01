import { resolvePageSectionImageSrc } from "@/lib/public-website/home-section-image";

export type ProductCategoryCard = {
  key: string;
  tag: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  shopCategory: string;
};

export const DEFAULT_PRODUCT_CATEGORY_RANGE_HEADING = "Our Product Range";
export const DEFAULT_PRODUCT_CATEGORY_RANGE_SUBTITLE =
  "At JEHMARP, we have a wide variety of options to suit different cooking styles and preferences. Our collection includes:";

export const HOME_PRODUCT_CATEGORY_RANGE_SECTION_ID =
  "b7e2d4f8-1a6c-4f9e-9d2b-8c5a1e3f7b20";
export const HOME_PRODUCT_CATEGORY_RANGE_SORT_ORDER = 7;

export const DEFAULT_PRODUCT_CATEGORIES: ProductCategoryCard[] = [
  {
    key: "chicken",
    tag: "Fresh & Local Cut",
    title: "Chicken",
    description:
      "From fresh whole chicken to prime cuts, ideal for daily family meals.",
    imageSrc: "/images/chicken_breast.png",
    imageAlt: "Fresh Chicken Cuts",
    shopCategory: "chicken",
  },
  {
    key: "pork",
    tag: "Premium Choice Cut",
    title: "Pork",
    description:
      "Juicy belly, chops, and ground pork carefully prepared for any recipe.",
    imageSrc: "/images/pork_belly.png",
    imageAlt: "Premium Pork Cuts",
    shopCategory: "pork",
  },
  {
    key: "egg",
    tag: "Farm Fresh Daily",
    title: "Egg",
    description:
      "Nutrient-rich, farm-fresh eggs gathered daily for top quality & taste.",
    imageSrc: "/images/fresh_eggs.png",
    imageAlt: "Farm Fresh Eggs",
    shopCategory: "egg",
  },
];

const CATEGORY_CARD_FIELDS = new Set<keyof ProductCategoryCard>([
  "key",
  "tag",
  "title",
  "description",
  "imageSrc",
  "imageAlt",
  "shopCategory",
]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeCategoryCard(
  value: unknown,
  fallback: ProductCategoryCard,
): ProductCategoryCard {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;

  return {
    key: stringValue(record.key) ?? fallback.key,
    tag: stringValue(record.tag) ?? fallback.tag,
    title: stringValue(record.title) ?? fallback.title,
    description: stringValue(record.description) ?? fallback.description,
    imageSrc: stringValue(record.imageSrc) ?? fallback.imageSrc,
    imageAlt: stringValue(record.imageAlt) ?? fallback.imageAlt,
    shopCategory: stringValue(record.shopCategory) ?? fallback.shopCategory,
  };
}

export function normalizeProductCategories(
  content: Record<string, unknown> | undefined,
) {
  const heading =
    stringValue(content?.heading) ?? DEFAULT_PRODUCT_CATEGORY_RANGE_HEADING;
  const subtitle =
    stringValue(content?.subtitle) ?? DEFAULT_PRODUCT_CATEGORY_RANGE_SUBTITLE;
  const rawCategories = Array.isArray(content?.categories) ? content.categories : [];

  const categories = DEFAULT_PRODUCT_CATEGORIES.map((fallback, index) =>
    normalizeCategoryCard(rawCategories[index], fallback),
  );

  return {
    heading,
    subtitle,
    categories,
  };
}

export function buildDefaultProductCategoryRangeContent() {
  return {
    heading: DEFAULT_PRODUCT_CATEGORY_RANGE_HEADING,
    subtitle: DEFAULT_PRODUCT_CATEGORY_RANGE_SUBTITLE,
    categories: DEFAULT_PRODUCT_CATEGORIES.map((category) => ({ ...category })),
  };
}

export function getProductCategoryImage(category: ProductCategoryCard) {
  const displaySrc =
    resolvePageSectionImageSrc(category.imageSrc) ?? category.imageSrc;

  return {
    imageSrc: category.imageSrc,
    imageAlt: category.imageAlt,
    displaySrc,
  };
}

export function updateProductCategoryField(
  content: Record<string, unknown>,
  categoryIndex: number,
  field: string,
  value: string,
) {
  if (!CATEGORY_CARD_FIELDS.has(field as keyof ProductCategoryCard)) {
    throw new Error("Unsupported product category field.");
  }

  const normalized = normalizeProductCategories(content);
  const categories = normalized.categories.map((category) => ({ ...category }));

  if (categoryIndex < 0 || categoryIndex >= categories.length) {
    throw new Error("Category index is required.");
  }

  categories[categoryIndex] = {
    ...categories[categoryIndex],
    [field]: value,
  };

  return {
    ...content,
    heading: normalized.heading,
    subtitle: normalized.subtitle,
    categories,
  };
}

export function updateProductCategoryImage(
  content: Record<string, unknown>,
  categoryIndex: number,
  imageSrc: string,
) {
  const normalized = normalizeProductCategories(content);
  const categories = normalized.categories.map((category) => ({ ...category }));

  if (categoryIndex < 0 || categoryIndex >= categories.length) {
    throw new Error("Category index is required.");
  }

  const previousSrc = categories[categoryIndex]?.imageSrc ?? null;
  categories[categoryIndex] = {
    ...categories[categoryIndex],
    imageSrc,
  };

  return {
    content: {
      ...content,
      heading: normalized.heading,
      subtitle: normalized.subtitle,
      categories,
    },
    previousSrc,
  };
}
