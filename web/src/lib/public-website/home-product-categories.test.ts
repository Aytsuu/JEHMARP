import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRODUCT_CATEGORIES,
  getProductCategoryImage,
  normalizeProductCategories,
  updateProductCategoryField,
  updateProductCategoryImage,
} from "./home-product-categories";

describe("home product categories", () => {
  it("returns default categories when section content is missing", () => {
    const result = normalizeProductCategories(undefined);

    expect(result.heading).toBe("Our Product Range");
    expect(result.categories).toHaveLength(3);
    expect(result.categories[0]?.key).toBe("chicken");
    expect(result.categories[1]?.imageSrc).toBe("/images/pork_belly.png");
  });

  it("merges stored category images with defaults", () => {
    const result = normalizeProductCategories({
      categories: [
        {
          imageSrc: "page-sections/chicken.jpg",
          imageAlt: "Updated chicken photo",
        },
      ],
    });

    expect(result.categories[0]?.imageSrc).toBe("page-sections/chicken.jpg");
    expect(result.categories[0]?.imageAlt).toBe("Updated chicken photo");
    expect(result.categories[0]?.title).toBe("Chicken");
    expect(result.categories[2]?.imageSrc).toBe(DEFAULT_PRODUCT_CATEGORIES[2]?.imageSrc);
  });

  it("updates a category field by index", () => {
    const updated = updateProductCategoryField(
      { categories: DEFAULT_PRODUCT_CATEGORIES },
      1,
      "tag",
      "Updated pork tag",
    );

    expect(updated.categories?.[1]).toMatchObject({
      key: "pork",
      tag: "Updated pork tag",
    });
  });

  it("updates a category image by index", () => {
    const updated = updateProductCategoryImage(
      { categories: DEFAULT_PRODUCT_CATEGORIES },
      0,
      "page-sections/new-chicken.jpg",
    );

    expect(updated.content.categories?.[0]).toMatchObject({
      imageSrc: "page-sections/new-chicken.jpg",
    });
    expect(updated.previousSrc).toBe("/images/chicken_breast.png");
  });

  it("resolves storage-backed category image urls", () => {
    const image = getProductCategoryImage({
      ...DEFAULT_PRODUCT_CATEGORIES[0],
      imageSrc: "page-sections/chicken.jpg",
    });

    expect(image.displaySrc).toContain("page-sections/chicken.jpg");
  });
});
