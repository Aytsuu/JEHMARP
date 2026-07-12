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

export const plannedTransactionTypeLabels: Record<PlannedTransactionType, string> = {
  retail_resale: "Retail resale",
  restaurant_supply: "Restaurant supply",
  market_stall: "Market stall",
  online_resale: "Online resale",
  other: "Other",
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
      subject: "Your JEHMARP reseller price list",
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
  const productRows = products.length > 0
    ? products.map((product, index) => buildProductRow(product, index)).join("")
    : `
      <tr>
        <td colspan="5" style="padding:20px 16px;text-align:center;color:#4b5563;font-size:14px;line-height:1.5;">
          No active products are available right now. Our team will follow up with pricing details.
        </td>
      </tr>
    `;

  const applicationSummary = [
    { label: "Reference", value: application.id },
    { label: "Business type", value: plannedTransactionTypeLabels[application.plannedTransactionType] },
    { label: "Expected weekly volume", value: application.expectedQuantityPerWeek },
    { label: "Contact number", value: application.contactNumber },
  ];

  const summaryRows = applicationSummary.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0e6c8;color:#6b7280;font-size:13px;width:42%;vertical-align:top;">
        ${escapeHtml(item.label)}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0e6c8;color:#111827;font-size:14px;font-weight:600;vertical-align:top;">
        ${escapeHtml(item.value)}
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Your JEHMARP reseller price list</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3efe4;color:#111827;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3efe4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:#ffffff;border:1px solid #eadfce;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background-color:#661818;background:linear-gradient(135deg,#661818 0%,#7a1f1f 100%);padding:28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td>
                      <p style="margin:0 0 8px;font-size:12px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;color:#f5de59;font-weight:700;">
                        JEHMARP Wholesale
                      </p>
                      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#ffffff;font-weight:700;">
                        Your reseller price list
                      </h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 12px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#111827;">
                  Hello ${escapeHtml(application.name)},
                </p>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;">
                  Thank you for applying as a JEHMARP reseller. Your application is on file and the current wholesale pricing is below.
                  Our team will review your details and contact you about verification and ordering.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#fffad9;border:1px solid #f0e6c8;border-radius:16px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <p style="margin:0 0 12px;font-size:12px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#661818;font-weight:700;">
                        Application summary
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${summaryRows}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <p style="margin:0 0 12px;font-size:12px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#661818;font-weight:700;">
                  Current reseller pricing
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #eadfce;border-radius:14px;overflow:hidden;">
                  <thead>
                    <tr style="background-color:#661818;">
                      <th align="left" style="padding:14px 12px;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#f5de59;font-weight:700;">Product</th>
                      <th align="left" style="padding:14px 10px;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#f5de59;font-weight:700;">Category</th>
                      <th align="left" style="padding:14px 10px;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#f5de59;font-weight:700;">Unit</th>
                      <th align="right" style="padding:14px 10px;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#f5de59;font-weight:700;">Retail</th>
                      <th align="right" style="padding:14px 12px;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#f5de59;font-weight:700;">Reseller</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${productRows}
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#faf7ef;border:1px solid #eadfce;border-radius:16px;">
                  <tr>
                    <td style="padding:22px 22px 8px;">
                      <p style="margin:0 0 14px;font-size:12px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#661818;font-weight:700;">
                        What happens next
                      </p>
                      <ol style="margin:0;padding:0 0 0 20px;color:#4b5563;font-size:14px;line-height:1.7;">
                        <li style="margin-bottom:8px;">Our administration team reviews your application and expected volume.</li>
                        <li style="margin-bottom:8px;">We confirm verification details and delivery logistics with you.</li>
                        <li style="margin-bottom:0;">Once approved, you can start placing wholesale orders using these reseller prices.</li>
                      </ol>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0;font-size:14px;line-height:1.7;color:#4b5563;">
                  If you have questions about this price list or your application, reply to this email and include your reference number.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#fffad9;padding:20px 32px;border-top:1px solid #f0e6c8;">
                <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#661818;font-weight:700;">
                  JEHMARP
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                  Premium meat supply for retailers, restaurants, market sellers, and online merchants.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildProductRow(product: ResellerProduct, index: number): string {
  const rowBackground = index % 2 === 0 ? "#ffffff" : "#fffdf5";

  return `
    <tr style="background-color:${rowBackground};">
      <td style="padding:14px 12px;font-size:14px;line-height:1.5;color:#111827;font-weight:600;border-top:1px solid #f0e6c8;">
        ${escapeHtml(product.name)}
      </td>
      <td style="padding:14px 10px;font-size:13px;line-height:1.5;color:#4b5563;border-top:1px solid #f0e6c8;">
        ${escapeHtml(formatCategory(product.category))}
      </td>
      <td style="padding:14px 10px;font-size:13px;line-height:1.5;color:#4b5563;border-top:1px solid #f0e6c8;">
        ${escapeHtml(product.unit_label)}
      </td>
      <td align="right" style="padding:14px 10px;font-size:13px;line-height:1.5;color:#6b7280;border-top:1px solid #f0e6c8;">
        ${escapeHtml(formatCurrency(product.default_price))}
      </td>
      <td align="right" style="padding:14px 12px;font-size:14px;line-height:1.5;color:#661818;font-weight:700;border-top:1px solid #f0e6c8;">
        ${escapeHtml(formatCurrency(product.reseller_price))}
      </td>
    </tr>
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
          formatCategory(product.category),
          product.unit_label,
          formatCurrency(product.default_price),
          formatCurrency(product.reseller_price),
        ].join(" | "),
      ).join("\n")
    : "No active products are available right now.";

  return [
    "JEHMARP WHOLESALE",
    "Your reseller price list",
    "",
    `Hello ${application.name},`,
    "",
    "Thank you for applying as a JEHMARP reseller. Your application is on file and the current wholesale pricing is below.",
    "",
    "Application summary",
    `Reference: ${application.id}`,
    `Business type: ${plannedTransactionTypeLabels[application.plannedTransactionType]}`,
    `Expected weekly volume: ${application.expectedQuantityPerWeek}`,
    `Contact number: ${application.contactNumber}`,
    "",
    "Current reseller pricing",
    "Product | Category | Unit | Retail | Reseller",
    rows,
    "",
    "What happens next",
    "1. Our administration team reviews your application and expected volume.",
    "2. We confirm verification details and delivery logistics with you.",
    "3. Once approved, you can start placing wholesale orders using these reseller prices.",
    "",
    "If you have questions, reply to this email and include your reference number.",
    "",
    "JEHMARP",
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

function formatCategory(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "General";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
