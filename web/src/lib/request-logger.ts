type RequestLogger = (message: string) => void;

type DevelopmentRequestLog = {
  durationMs: number;
  enabled: boolean;
  logger?: RequestLogger;
  method: string;
  status: number;
  url: URL | string;
};

type DevelopmentLoadErrorLog = {
  enabled: boolean;
  error: unknown;
  logger?: RequestLogger;
  url: URL | string;
};

type DevelopmentActionErrorLog = {
  action: string;
  enabled: boolean;
  error: unknown;
  logger?: RequestLogger;
  phase: "validation" | "execution";
  scope: string;
  url: URL | string;
};

type DevelopmentFormSubmitErrorLog = {
  body: Record<string, unknown>;
  enabled: boolean;
  error: unknown;
  logger?: RequestLogger;
  scope: string;
  status: number;
  url: URL | string;
};

const sensitiveQueryKeyPattern =
  /(?:auth|code|cookie|key|password|secret|session|signature|token)/i;

export function buildSafeRequestTarget(url: URL | string) {
  const parsedUrl =
    typeof url === "string" ? new URL(url, "http://localhost") : url;
  const queryKeys = [...new Set(parsedUrl.searchParams.keys())].sort((a, b) =>
    a.localeCompare(b),
  );

  const pathname = redactSensitivePath(parsedUrl.pathname);

  if (queryKeys.length === 0) {
    return pathname;
  }

  const safeQuery = queryKeys
    .map((key) => {
      const value = sensitiveQueryKeyPattern.test(key) ? "[redacted]" : "[set]";

      return `${encodeURIComponent(key)}=${value}`;
    })
    .join("&");

  return `${pathname}?${safeQuery}`;
}

export function logDevelopmentRequest({
  durationMs,
  enabled,
  logger = console.warn,
  method,
  status,
  url,
}: DevelopmentRequestLog) {
  if (!enabled) return;

  logger(
    `[dev:request] ${method.toUpperCase()} ${buildSafeRequestTarget(url)} -> ${status} ${Math.max(0, Math.round(durationMs))}ms`,
  );
}

export function logDevelopmentLoadError({
  enabled,
  error,
  logger = console.error,
  url,
}: DevelopmentLoadErrorLog) {
  if (!enabled) return;

  logger(`[dev:load-error] ${buildSafeRequestTarget(url)} ${formatErrorForLog(error)}`);
}

export function logDevelopmentActionError({
  action,
  enabled,
  error,
  logger = console.error,
  phase,
  scope,
  url,
}: DevelopmentActionErrorLog) {
  if (!enabled) return;

  logger(
    `[dev:action-error] ${scope} ${action} ${phase} ${buildSafeRequestTarget(url)} ${formatErrorForLog(error)}`,
  );
}

export function logDevelopmentFormSubmitError({
  body,
  enabled,
  error,
  logger = console.error,
  scope,
  status,
  url,
}: DevelopmentFormSubmitErrorLog) {
  if (!enabled) return;

  logger(
    `[dev:form-submit] ${scope} ${buildSafeRequestTarget(url)} status=${status} body=${formatBodyForLog(body)} ${formatErrorForLog(error)}`,
  );
}

function redactSensitivePath(pathname: string) {
  return pathname.replace(
    /^\/customer-registration\/[^/]+/,
    "/customer-registration/[token]",
  );
}

function formatUnknownError(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const record = error as Record<string, unknown>;
  const parts = [
    ["code", record.code],
    ["message", record.message],
    ["details", record.details],
    ["hint", record.hint],
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([key, value]) => `${key}=${value}`);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

function formatErrorForLog(error: unknown) {
  if (!(error instanceof Error)) {
    return formatUnknownError(error);
  }

  const cause = error.cause instanceof Error
    ? ` cause=${error.cause.message}`
    : error.cause
      ? ` cause=${formatUnknownError(error.cause)}`
      : "";

  return `${error.name}: ${error.message}${cause}`;
}

function formatBodyForLog(body: Record<string, unknown>) {
  try {
    return JSON.stringify(body);
  } catch {
    return "{}";
  }
}
