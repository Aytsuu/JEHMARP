export const plannedTransactionTypes = [
  "retail_resale",
  "restaurant_supply",
  "market_stall",
  "online_resale",
  "other",
] as const;

export type PlannedTransactionType = (typeof plannedTransactionTypes)[number];

export type ResellerApplicationInput = {
  name: string;
  email: string;
  address: string;
  plannedTransactionType: PlannedTransactionType;
  expectedQuantityPerWeek: string;
  contactNumber: string;
  message?: string;
  turnstileToken: string;
};

export type ResellerProduct = {
  name: string;
  category: string;
  unit_label: string;
  default_price: number | string;
  reseller_price: number | string;
};

export type StoredResellerApplication = Omit<ResellerApplicationInput, "turnstileToken"> & {
  id: string;
};

export type EmailProviderConfig = {
  apiKey?: string;
  from?: string;
  adminEmail?: string;
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
      reservationKey: string;
    }
  | {
      configured: true;
      allowed: false;
      status: 409 | 429;
      error: string;
      reservationKey?: string;
    };

export type EmailDeliveryResult =
  | {
      status: "sent";
    }
  | {
      status: "failed";
      error: string;
    };

export type FetchLike = typeof fetch;

type ValidationResult =
  | {
      success: true;
      data: ResellerApplicationInput;
    }
  | {
      success: false;
      errors: string[];
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateResellerApplicationInput(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { success: false, errors: ["Application payload is required."] };
  }

  const errors: string[] = [];
  const name = normalizeString(input.name);
  const email = normalizeString(input.email).toLowerCase();
  const address = normalizeString(input.address);
  const plannedTransactionType = normalizeString(input.plannedTransactionType);
  const expectedQuantityPerWeek = normalizeString(input.expectedQuantityPerWeek);
  const contactNumber = normalizeString(input.contactNumber);
  const message = normalizeString(input.message);
  const turnstileToken = normalizeString(input.turnstileToken);

  if (name.length < 1 || name.length > 120) {
    errors.push("Name is required and must be 120 characters or fewer.");
  }

  if (!emailPattern.test(email) || email.length > 254) {
    errors.push("A valid email address is required.");
  }

  if (address.length < 1 || address.length > 500) {
    errors.push("Business address is required and must be 500 characters or fewer.");
  }

  if (!isPlannedTransactionType(plannedTransactionType)) {
    errors.push("Select a valid transaction type.");
  }

  if (expectedQuantityPerWeek.length < 1 || expectedQuantityPerWeek.length > 120) {
    errors.push("Expected weekly quantity is required and must be 120 characters or fewer.");
  }

  if (contactNumber.length < 1 || contactNumber.length > 50) {
    errors.push("Contact number is required and must be 50 characters or fewer.");
  }

  if (message.length > 1000) {
    errors.push("Message must be 1000 characters or fewer.");
  }

  if (turnstileToken.length < 1) {
    errors.push("Please complete the verification challenge.");
  }

  if (errors.length > 0 || !isPlannedTransactionType(plannedTransactionType)) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      email,
      address,
      plannedTransactionType,
      expectedQuantityPerWeek,
      contactNumber,
      message: message || undefined,
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

export async function sendResellerPriceList(
  fetcher: FetchLike,
  config: EmailProviderConfig,
  application: StoredResellerApplication,
  products: ResellerProduct[],
): Promise<EmailDeliveryResult> {
  if (!config.apiKey || !config.from) {
    return {
      status: "failed",
      error: "Email provider is not configured.",
    };
  }

  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [application.email],
      bcc: config.adminEmail ? [config.adminEmail] : undefined,
      subject: "JEHMARP reseller price list",
      html: buildPriceListHtml(application, products),
      text: buildPriceListText(application, products),
    }),
  });

  if (!response.ok) {
    const providerError = await response.text().catch(() => "");

    return {
      status: "failed",
      error: normalizeProviderError(providerError),
    };
  }

  return { status: "sent" };
}

export async function checkRedisResellerApplicationRateLimit(
  fetcher: FetchLike,
  config: RedisRateLimitConfig,
  params: {
    email: string;
    clientIp?: string | null;
  },
): Promise<RedisRateLimitResult> {
  if (!config.restUrl || !config.restToken) {
    return { configured: false };
  }

  const emailHash = await sha256Hex(params.email);
  const duplicateKey = `reseller-application:email-day:${emailHash}`;
  const duplicateReservation = await redisCommand(fetcher, config, [
    "set",
    duplicateKey,
    "1",
    "ex",
    "86400",
    "nx",
  ]);

  if (duplicateReservation.result !== "OK") {
    return {
      configured: true,
      allowed: false,
      status: 409,
      error: "An application from this email was already submitted recently.",
    };
  }

  const emailHourKey = `reseller-application:email-hour:${emailHash}`;
  const emailWindow = await incrementExpiringCounter(fetcher, config, emailHourKey, 3600);

  if (emailWindow > 3) {
    return {
      configured: true,
      allowed: false,
      status: 429,
      error: "Too many applications were submitted from this email. Please try again later.",
      reservationKey: duplicateKey,
    };
  }

  if (params.clientIp) {
    const ipHash = await sha256Hex(params.clientIp);
    const ipHourKey = `reseller-application:ip-hour:${ipHash}`;
    const ipWindow = await incrementExpiringCounter(fetcher, config, ipHourKey, 3600);

    if (ipWindow > 10) {
      return {
        configured: true,
        allowed: false,
        status: 429,
        error: "Too many applications were submitted from this network. Please try again later.",
        reservationKey: duplicateKey,
      };
    }
  }

  return {
    configured: true,
    allowed: true,
    reservationKey: duplicateKey,
  };
}

export async function releaseRedisRateLimitReservation(
  fetcher: FetchLike,
  config: RedisRateLimitConfig,
  reservationKey: string | undefined,
): Promise<void> {
  if (!config.restUrl || !config.restToken || !reservationKey) {
    return;
  }

  await redisCommand(fetcher, config, ["del", reservationKey]);
}

export function buildPriceListHtml(
  application: StoredResellerApplication,
  products: ResellerProduct[],
): string {
  const rows = products.map((product) => `
    <tr>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.category)}</td>
      <td>${escapeHtml(product.unit_label)}</td>
      <td>${formatCurrency(product.default_price)}</td>
      <td>${formatCurrency(product.reseller_price)}</td>
    </tr>
  `).join("");
  const priceRows = rows || `
    <tr>
      <td colspan="5">No active products are available right now.</td>
    </tr>
  `;

  return `
    <div>
      <p>Hello ${escapeHtml(application.name)},</p>
      <p>Thank you for applying as a JEHMARP reseller. Here is the current reseller price list.</p>
      <table border="1" cellpadding="8" cellspacing="0">
        <thead>
          <tr>
            <th align="left">Product</th>
            <th align="left">Category</th>
            <th align="left">Unit</th>
            <th align="right">Default price</th>
            <th align="right">Reseller price</th>
          </tr>
        </thead>
        <tbody>${priceRows}</tbody>
      </table>
      <p>JEHMARP will review your application details and contact you for the next steps.</p>
    </div>
  `;
}

export function buildPriceListText(
  application: StoredResellerApplication,
  products: ResellerProduct[],
): string {
  const rows = products.length > 0
    ? products.map((product) =>
        [
          product.name,
          product.category,
          product.unit_label,
          formatCurrency(product.default_price),
          formatCurrency(product.reseller_price),
        ].join(" | "),
      ).join("\n")
    : "No active products are available right now.";

  return [
    `Hello ${application.name},`,
    "",
    "Thank you for applying as a JEHMARP reseller. Here is the current reseller price list.",
    "",
    "Product | Category | Unit | Default price | Reseller price",
    rows,
    "",
    "JEHMARP will review your application details and contact you for the next steps.",
  ].join("\n");
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPlannedTransactionType(value: string): value is PlannedTransactionType {
  return plannedTransactionTypes.includes(value as PlannedTransactionType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value: number | string): string {
  const amount = typeof value === "number" ? value : Number(value);

  return Number.isFinite(amount) ? `PHP ${amount.toFixed(2)}` : "PHP 0.00";
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

function normalizeProviderError(value: string): string {
  if (!value) {
    return "Email provider rejected the message.";
  }

  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}
