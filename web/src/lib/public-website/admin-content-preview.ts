export const ADMIN_CONTENT_PREVIEW_ROOT = "/admin/content";

const ADMIN_PREVIEW_PUBLIC_PATHS = new Set([
  "/",
  "/our-story",
  "/shop",
  "/track",
  "/business",
  "/contact",
]);

export function isAdminContentPreviewPath(pathname: string): boolean {
  if (pathname === ADMIN_CONTENT_PREVIEW_ROOT) {
    return true;
  }

  if (!pathname.startsWith(`${ADMIN_CONTENT_PREVIEW_ROOT}/`)) {
    return false;
  }

  const publicPath = pathname.slice(ADMIN_CONTENT_PREVIEW_ROOT.length) || "/";

  return ADMIN_PREVIEW_PUBLIC_PATHS.has(publicPath);
}

export function toAdminContentPreviewHref(publicHref: string): string {
  if (!publicHref.startsWith("/")) {
    return publicHref;
  }

  if (publicHref === "/login") {
    return "/admin/login";
  }

  if (publicHref === "/") {
    return ADMIN_CONTENT_PREVIEW_ROOT;
  }

  if (
    publicHref.startsWith("/admin") ||
    publicHref.startsWith("/agent") ||
    publicHref.startsWith("/api")
  ) {
    return publicHref;
  }

  return `${ADMIN_CONTENT_PREVIEW_ROOT}${publicHref}`;
}

export function toPublicPathFromAdminPreview(pathname: string): string {
  if (pathname === ADMIN_CONTENT_PREVIEW_ROOT) {
    return "/";
  }

  if (pathname.startsWith(`${ADMIN_CONTENT_PREVIEW_ROOT}/`)) {
    return pathname.slice(ADMIN_CONTENT_PREVIEW_ROOT.length) || "/";
  }

  return pathname;
}

export function resolveFormReturnPath(
  formData: FormData,
  defaultPath: string,
): string {
  const returnPath = formData.get("returnPath");

  if (typeof returnPath === "string" && isAdminContentPreviewPath(returnPath)) {
    return returnPath;
  }

  return defaultPath;
}
