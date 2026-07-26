import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPublicFeaturedProductsCacheKey,
  buildPublicPageCacheKey,
  deleteCachedJson,
  getCachedJson,
  resetPublicContentCacheForTests,
  setCachedJson,
} from "./content-cache";

describe("content-cache", () => {
  beforeEach(() => {
    resetPublicContentCacheForTests();
    vi.restoreAllMocks();
  });

  it("builds stable cache keys for page content and featured products", () => {
    expect(buildPublicPageCacheKey("home")).toBe("public-page:home");
    expect(buildPublicFeaturedProductsCacheKey(4)).toBe("public-featured-products:4");
  });

  it("stores and reads JSON from the in-process cache", async () => {
    await setCachedJson("public-page:home", { page: null, sections: [] }, 60);

    await expect(getCachedJson("public-page:home")).resolves.toEqual({
      page: null,
      sections: [],
    });
  });

  it("expires in-process cache entries after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T00:00:00.000Z"));

    await setCachedJson("public-page:contact", { page: null, sections: [] }, 60);
    vi.setSystemTime(new Date("2026-07-26T00:01:01.000Z"));

    await expect(getCachedJson("public-page:contact")).resolves.toBeNull();

    vi.useRealTimers();
  });

  it("deletes cached entries", async () => {
    await setCachedJson("public-page:our-story", { page: null, sections: [] }, 60);
    await deleteCachedJson("public-page:our-story");

    await expect(getCachedJson("public-page:our-story")).resolves.toBeNull();
  });
});
