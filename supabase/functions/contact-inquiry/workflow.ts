export type ContactInquiryInput = {
  name: string;
  email?: string;
  phoneNumber?: string;
  message: string;
  turnstileToken: string;
};

export type RedisRateLimitConfig = {
  restUrl?: string;
  restToken?: string;
};

export type RedisRateLimitResult =
  | {
      configured: false;
      error?: string;
    }
  | {
      configured: true;
      allowed: true;
    }
  | {
      configured: true;
      allowed: false;
      status: 429;
      error: string;
    };

export type FetchLike = typeof fetch;

type ValidationResult =
  | {
      success: true;
      data: ContactInquiryInput;
    }
  | {
      success: false;
      errors: string[];
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactInquiryInput(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { success: false, errors: ["Inquiry payload is required."] };
  }

  const errors: string[] = [];
  const name = normalizeString(input.name);
  const email = normalizeString(input.email).toLowerCase();
  const phoneNumber = normalizeString(input.phoneNumber);
  const message = normalizeString(input.message);
  const turnstileToken = normalizeString(input.turnstileToken);

  if (name.length < 1 || name.length > 120) {
    errors.push("Name is required and must be 120 characters or fewer.");
  }

  if (email && (!emailPattern.test(email) || email.length > 254)) {
    errors.push("Email must be valid when provided.");
  }

  if (phoneNumber.length > 50) {
    errors.push("Phone number must be 50 characters or fewer.");
  }

  if (!email && !phoneNumber) {
    errors.push("Email or phone number is required.");
  }

  if (message.length < 1 || message.length > 2000) {
    errors.push("Message is required and must be 2000 characters or fewer.");
  }

  if (turnstileToken.length < 1) {
    errors.push("Please complete the verification challenge.");
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      email: email || undefined,
      phoneNumber: phoneNumber || undefined,
      message,
      turnstileToken,
    },
  };
}

export async function verifyTurnstileToken(
  fetcher: FetchLike,
  params: {
    secret?: string;
    token: string;
    remoteIp?: string | null;
  },
): Promise<{ success: true } | { success: false; error: string }> {
  if (!params.secret) {
    return { success: false, error: "Verification is not configured." };
  }

  const formData = new FormData();
  formData.set("secret", params.secret);
  formData.set("response", params.token);

  if (params.remoteIp) {
    formData.set("remoteip", params.remoteIp);
  }

  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !isRecord(data) || data.success !== true) {
    return { success: false, error: "Verification failed. Please try again." };
  }

  return { success: true };
}

export async function checkRedisContactInquiryRateLimit(
  fetcher: FetchLike,
  config: RedisRateLimitConfig,
  params: {
    email?: string;
    clientIp?: string | null;
  },
): Promise<RedisRateLimitResult> {
  if (!config.restUrl || !config.restToken) {
    return { configured: false };
  }

  if (params.email) {
    const emailHash = await sha256Hex(params.email);
    const emailWindow = await incrementExpiringCounter(
      fetcher,
      config,
      `contact-inquiry:email-hour:${emailHash}`,
      3600,
    );

    if (emailWindow > 3) {
      return {
        configured: true,
        allowed: false,
        status: 429,
        error: "Too many inquiries were submitted from this email. Please try again later.",
      };
    }
  }

  if (params.clientIp) {
    const ipHash = await sha256Hex(params.clientIp);
    const ipWindow = await incrementExpiringCounter(
      fetcher,
      config,
      `contact-inquiry:ip-hour:${ipHash}`,
      3600,
    );

    if (ipWindow > 10) {
      return {
        configured: true,
        allowed: false,
        status: 429,
        error: "Too many inquiries were submitted from this network. Please try again later.",
      };
    }
  }

  return {
    configured: true,
    allowed: true,
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function incrementExpiringCounter(
  fetcher: FetchLike,
  config: RedisRateLimitConfig,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const response = await redisCommand(fetcher, config, ["incr", key]);
  const count = Number(response.result);

  if (!Number.isFinite(count)) {
    throw new Error("Redis counter response was invalid.");
  }

  if (count === 1) {
    await redisCommand(fetcher, config, ["expire", key, String(ttlSeconds)]);
  }

  return count;
}

async function redisCommand(
  fetcher: FetchLike,
  config: RedisRateLimitConfig,
  command: string[],
): Promise<{ result: unknown }> {
  if (!config.restUrl || !config.restToken) {
    throw new Error("Redis is not configured.");
  }

  const url = `${config.restUrl.replace(/\/$/, "")}/${command.map(encodeURIComponent).join("/")}`;
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.restToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !isRecord(data) || !("result" in data)) {
    throw new Error("Redis command failed.");
  }

  return data as { result: unknown };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
