export const SYSTEM_ISSUE_PATH = "/system-issue";

export function buildSystemIssueUrl(returnTo: string): string {
  const params = new URLSearchParams();

  if (returnTo && returnTo !== SYSTEM_ISSUE_PATH) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query ? `${SYSTEM_ISSUE_PATH}?${query}` : SYSTEM_ISSUE_PATH;
}

export function getSafeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function getSystemIssueHomePath(returnTo: string): string {
  if (returnTo.startsWith("/admin")) {
    return "/admin";
  }

  if (returnTo.startsWith("/agent")) {
    return "/agent";
  }

  return "/";
}
