import { describe, expect, it } from "vitest";

import {
  MARKETING_PAGE_CACHE_CONTROL,
  applyMarketingPageResponseHeaders,
  shouldCacheMarketingPageResponse,
} from "./marketing-page-response";

describe("marketing-page-response", () => {
  it("allows caching for plain marketing page requests", () => {
    expect(shouldCacheMarketingPageResponse(new URL("https://example.test/"))).toBe(true);
    expect(shouldCacheMarketingPageResponse(new URL("https://example.test/contact"))).toBe(
      true,
    );
  });

  it("disables caching when feedback query params are present", () => {
    expect(
      shouldCacheMarketingPageResponse(new URL("https://example.test/contact?inquiry=submitted")),
    ).toBe(false);
    expect(
      shouldCacheMarketingPageResponse(
        new URL("https://example.test/business?application=submitted"),
      ),
    ).toBe(false);
    expect(
      shouldCacheMarketingPageResponse(new URL("https://example.test/shop?order=submitted")),
    ).toBe(false);
  });

  it("sets cache-control headers based on feedback params", () => {
    const cacheableHeaders = new Headers();
    applyMarketingPageResponseHeaders(cacheableHeaders, new URL("https://example.test/"));
    expect(cacheableHeaders.get("Cache-Control")).toBe(MARKETING_PAGE_CACHE_CONTROL);

    const feedbackHeaders = new Headers();
    applyMarketingPageResponseHeaders(
      feedbackHeaders,
      new URL("https://example.test/contact?inquiry=error"),
    );
    expect(feedbackHeaders.get("Cache-Control")).toBe("no-store");
  });
});
