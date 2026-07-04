export function isTrustedFormOrigin(headers: Headers, currentUrl: URL): boolean {
  const origin = headers.get("origin");

  if (origin) {
    return hasSameOrigin(origin, currentUrl);
  }

  const referer = headers.get("referer");

  return referer ? hasSameOrigin(referer, currentUrl) : false;
}

function hasSameOrigin(value: string, currentUrl: URL): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === currentUrl.protocol && parsed.host === currentUrl.host;
  } catch {
    return false;
  }
}
