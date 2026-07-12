export type TurnstileVerifyOptions = {
  fetch?: typeof fetch;
  clientIp?: string | null;
};

export async function verifyTurnstileToken(
  secretKey: string | undefined,
  token: string,
  options: TurnstileVerifyOptions = {},
): Promise<void> {
  if (!secretKey) {
    throw new Error("Verification is not configured.");
  }

  const fetcher = options.fetch ?? fetch;
  const body = new FormData();

  body.set("secret", secretKey);
  body.set("response", token);

  if (options.clientIp) {
    body.set("remoteip", options.clientIp);
  }

  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const data = await readJsonResponse(response);

  if (!response.ok || data.success !== true) {
    throw new Error("Verification failed. Please try again.");
  }
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));

  return typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
}
