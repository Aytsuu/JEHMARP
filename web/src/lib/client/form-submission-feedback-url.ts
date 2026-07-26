export const GUEST_ORDER_FEEDBACK_PARAMS = ["order", "email", "message"] as const;

export const CONTACT_INQUIRY_FEEDBACK_PARAMS = ["inquiry", "message"] as const;

export const RESELLER_APPLICATION_FEEDBACK_PARAMS = [
  "application",
  "message",
] as const;

export function stripFeedbackSearchParams(
  searchParams: URLSearchParams,
  keys: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(searchParams);

  for (const key of keys) {
    next.delete(key);
  }

  return next;
}

export function buildPathWithFeedbackParamsRemoved(
  url: URL,
  keys: readonly string[],
): string {
  const nextParams = stripFeedbackSearchParams(url.searchParams, keys);
  const query = nextParams.toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}
