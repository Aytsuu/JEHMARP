import { describe, expect, it } from "vitest";

import {
  buildProductCategoryOptions,
  buildProductUnitOptions,
  defaultProductCategories,
  defaultProductUnitLabels,
  normalizeProductOptionValue,
} from "./product-options";

describe("product option builders", () => {
  it("keeps default categories first and appends inferred custom categories once", () => {
    expect(
      buildProductCategoryOptions([
        { category: "Seafood" },
        { category: " chicken " },
        { category: "seafood" },
        { category: "" },
      ]),
    ).toEqual([...defaultProductCategories, "seafood"]);
  });

  it("keeps default unit labels first and appends inferred custom units once", () => {
    expect(
      buildProductUnitOptions([
        { unit_label: "Bundle" },
        { unit_label: "kg" },
        { unit_label: " bundle " },
      ]),
    ).toEqual([...defaultProductUnitLabels, "bundle"]);
  });

  it("normalizes product option values for consistent persistence", () => {
    expect(normalizeProductOptionValue(" Half Sack ")).toBe("half sack");
    expect(normalizeProductOptionValue(null)).toBe("");
  });
});
