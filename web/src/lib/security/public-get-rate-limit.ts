import { getServerEnv } from "@/lib/env";
import { getClientIp } from "@/lib/security/client-ip";
import { enforceFixedWindowRateLimit } from "@/lib/security/rate-limit";

export const PUBLIC_GET_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
} as const;

const PUBLIC_GET_RATE_LIMIT_PATHS = {
  "/": "public-get:home",
  "/shop": "public-get:shop",
} as const;

export type PublicGetRateLimitPath = keyof typeof PUBLIC_GET_RATE_LIMIT_PATHS;

let loggedMissingRedisWarning = false;

export function getPublicGetRateLimitKeyPrefix(
  pathname: string,
): string | null {
  if (pathname in PUBLIC_GET_RATE_LIMIT_PATHS) {
    return PUBLIC_GET_RATE_LIMIT_PATHS[pathname as PublicGetRateLimitPath];
  }

  return null;
}

export function shouldApplyPublicGetRateLimit(
  method: string,
  pathname: string,
): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  if (pathname.startsWith("/admin")) {
    return false;
  }

  return getPublicGetRateLimitKeyPrefix(pathname) !== null;
}

export async function enforcePublicGetRateLimit(options: {
  fetch?: typeof fetch;
  headers: Headers;
  pathname: string;
}): Promise<Response | null> {
  const keyPrefix = getPublicGetRateLimitKeyPrefix(options.pathname);
  if (!keyPrefix) {
    return null;
  }

  const env = getServerEnv();
  if (!env.upstashRedisRestUrl || !env.upstashRedisRestToken) {
    if (!loggedMissingRedisWarning) {
      console.warn("Public GET rate limiting is not configured; allowing requests.");
      loggedMissingRedisWarning = true;
    }

    return null;
  }

  const clientIp = getClientIp(options.headers);
  if (!clientIp) {
    return null;
  }

  const exceededMessage = "Too many requests. Please try again later.";

  try {
    await enforceFixedWindowRateLimit({
      fetch: options.fetch,
      redisUrl: env.upstashRedisRestUrl,
      redisToken: env.upstashRedisRestToken,
      keyPrefix,
      identifier: clientIp,
      limit: PUBLIC_GET_RATE_LIMIT.limit,
      windowSeconds: PUBLIC_GET_RATE_LIMIT.windowSeconds,
      exceededMessage,
      unavailableMessage: "Public GET rate limiting is unavailable.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === exceededMessage) {
      return new Response("Too many requests. Please try again later.", {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": String(PUBLIC_GET_RATE_LIMIT.windowSeconds),
        },
      });
    }

    console.warn("Public GET rate limiting is unavailable; allowing request.", error);
  }

  return null;
}

export function resetPublicGetRateLimitWarningsForTests() {
  loggedMissingRedisWarning = false;
}
