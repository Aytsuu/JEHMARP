import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOOTER_BRAND_DESCRIPTION,
  getBrandLines,
  resolveFooterBrandDescription,
} from "./branding";

describe("resolveFooterBrandDescription", () => {
  it("uses the home about summary when available", () => {
    expect(
      resolveFooterBrandDescription([
        {
          type: "about",
          content: { summary: "From Farm to Table, Guided by Faith and Family" },
        },
      ]),
    ).toBe("From Farm to Table, Guided by Faith and Family");
  });

  it("falls back to the default footer description", () => {
    expect(resolveFooterBrandDescription([])).toBe(DEFAULT_FOOTER_BRAND_DESCRIPTION);
  });
});

describe("getBrandLines", () => {
  it("uses the configured trade name for the brand title", () => {
    expect(getBrandLines({ tradeName: "JEHMARP Meatshop" })[0]).toBe("JEHMARP Meatshop");
  });
});
