import { createHash } from "node:crypto";

export type FixedWindowRateLimitOptions = {
  fetch?: typeof fetch;
  redisUrl: string | undefined;
  redisToken: string | undefined;
  keyPrefix: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  exceededMessage: string;
  unavailableMessage: string;
};

export async function enforceFixedWindowRateLimit(
  options: FixedWindowRateLimitOptions,
): Promise<void> {
  if (!options.redisUrl || !options.redisToken) {
    throw new Error(options.unavailableMessage);
  }

  const fetcher = options.fetch ?? fetch;
  const key = `${options.keyPrefix}:${hashValue(options.identifier)}`;
  const count = await runRedisNumberCommand(
    fetcher,
    options.redisUrl,
    options.redisToken,
    ["incr", key],
    options.unavailableMessage,
  );

  if (count === 1) {
    await runRedisNumberCommand(
      fetcher,
      options.redisUrl,
      options.redisToken,
      ["expire", key, String(options.windowSeconds)],
      options.unavailableMessage,
    );
  }

  if (count > options.limit) {
    throw new Error(options.exceededMessage);
  }
}

async function runRedisNumberCommand(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  parts: string[],
  errorMessage: string,
): Promise<number> {
  const url = `${redisUrl.replace(/\/$/, "")}/${parts.map(encodeURIComponent).join("/")}`;
  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${redisToken}`,
    },
  });
  const data = await readJsonResponse(response);

  if (!response.ok || typeof data.result !== "number") {
    throw new Error(errorMessage);
  }

  return data.result;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));

  return typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
