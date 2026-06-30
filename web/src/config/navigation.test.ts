import { describe, expect, it } from "vitest";

import { primaryNavigation } from "./navigation";

describe("primaryNavigation", () => {
  it("defines the public routes and a single shared login route", () => {
    expect(primaryNavigation).toEqual([
      { label: "Home", href: "/" },
      { label: "Our Story", href: "/our-story" },
      { label: "Shop", href: "/shop" },
      { label: "Business", href: "/business" },
      { label: "Contact", href: "/contact" },
      { label: "Login", href: "/login" },
    ]);
  });

  it("does not define duplicate route hrefs", () => {
    const hrefs = primaryNavigation.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
