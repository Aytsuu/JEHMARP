export const MARKETING_PAGE_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

const FEEDBACK_QUERY_PARAMS = ["inquiry", "application", "order"] as const;

export function shouldCacheMarketingPageResponse(url: URL): boolean {
  return !FEEDBACK_QUERY_PARAMS.some((param) => url.searchParams.has(param));
}

export function applyMarketingPageResponseHeaders(
  headers: Headers,
  url: URL,
): void {
  if (shouldCacheMarketingPageResponse(url)) {
    headers.set("Cache-Control", MARKETING_PAGE_CACHE_CONTROL);
    return;
  }

  headers.set("Cache-Control", "no-store");
}
