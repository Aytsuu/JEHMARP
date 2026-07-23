import { createHash } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { autoCapitalize } from "@/lib/formatters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendCustomerTrackingNumberEmail } from "@/lib/public-website/customer-tracking-email";

const trackingNumberPattern = /^JHM-[A-HJ-NP-Z2-9]{8}$/;

export type CustomerTrackingOrderItem = {
  productName: string;
  quantity: number;
  unitLabel: string;
  addDetails: string | null;
};

export type CustomerTrackingOrder = {
  id: string;
  orderStatus: string;
  paymentStatus: string;
  source: string;
  createdAt: string;
  orderTotal: number;
  amountDue: number;
  items: CustomerTrackingOrderItem[];
};

export type CustomerTrackingLookupResult = {
  trackingNumber: string;
  totalAmountDue: number;
  orders: CustomerTrackingOrder[];
};

export type CustomerTrackingLookupOptions = {
  fetch?: typeof fetch;
  clientIp?: string | null;
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
};

export type NewCustomerTrackingEmailStatus = "sent" | "failed" | "skipped";

export function normalizeCustomerTrackingNumber(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");

  if (!trackingNumberPattern.test(normalized)) {
    return null;
  }

  return normalized;
}

export async function deliverNewCustomerTrackingNotification(options: {
  trackingNumber: string;
  recipientName: string;
  email?: string | null;
  siteOrigin?: string;
  includeOrderSubmittedNote?: boolean;
  fetch?: typeof fetch;
}): Promise<NewCustomerTrackingEmailStatus> {
  if (!options.email?.trim() || !options.siteOrigin) {
    return "skipped";
  }

  const emailResult = await sendCustomerTrackingNumberEmail(
    options.email.trim(),
    {
      recipientName: options.recipientName,
      trackingNumber: options.trackingNumber,
      trackPageUrl: buildCustomerTrackPageUrl(options.siteOrigin, options.trackingNumber),
      includeOrderSubmittedNote: options.includeOrderSubmittedNote,
    },
    { fetch: options.fetch },
  );

  if (emailResult.status === "failed") {
    console.error("Unable to deliver customer tracking email.", emailResult.error);
  }

  return emailResult.status;
}

export function formatNewCustomerTrackingFeedback(options: {
  baseMessage: string;
  trackingNumber: string;
  emailStatus: NewCustomerTrackingEmailStatus;
}): string {
  const { baseMessage, trackingNumber, emailStatus } = options;

  if (emailStatus === "sent") {
    return `${baseMessage} Customer tracking number ${trackingNumber} was emailed to the customer.`;
  }

  if (emailStatus === "failed") {
    return `${baseMessage} Customer tracking number: ${trackingNumber}. Email delivery failed, so share it with the customer manually.`;
  }

  return `${baseMessage} Customer tracking number: ${trackingNumber}. Share it with the customer for order tracking.`;
}

export function formatMultipleNewCustomerTrackingFeedback(options: {
  baseMessage: string;
  trackingNumbers: string[];
  emailStatuses: NewCustomerTrackingEmailStatus[];
}): string {
  const trackingNumbers = options.trackingNumbers.join(", ");
  const emailSent = options.emailStatuses.includes("sent");
  const emailFailed = options.emailStatuses.includes("failed");

  if (emailSent && !emailFailed) {
    return `${options.baseMessage} Customer tracking numbers ${trackingNumbers} were emailed to the customer(s).`;
  }

  if (emailFailed) {
    return `${options.baseMessage} Customer tracking numbers: ${trackingNumbers}. Email delivery failed for at least one customer, so share them manually.`;
  }

  return `${options.baseMessage} Customer tracking numbers: ${trackingNumbers}. Share them with the customer(s) for order tracking.`;
}

export async function finalizeNewCustomerCreation(options: {
  trackingNumber: string;
  recipientName: string;
  email?: string | null;
  siteOrigin?: string;
  baseMessage: string;
  includeOrderSubmittedNote?: boolean;
  fetch?: typeof fetch;
}): Promise<{ statusMessage: string }> {
  const emailStatus = await deliverNewCustomerTrackingNotification(options);

  return {
    statusMessage: formatNewCustomerTrackingFeedback({
      baseMessage: options.baseMessage,
      trackingNumber: options.trackingNumber,
      emailStatus,
    }),
  };
}

export function buildCustomerTrackPageUrl(origin: string, trackingNumber?: string): string {
  const url = new URL("/track", origin);

  if (trackingNumber) {
    url.searchParams.set("number", trackingNumber);
  }

  return url.toString();
}

export async function lookupCustomerOrdersByTrackingNumber(
  rawTrackingNumber: string,
  options: CustomerTrackingLookupOptions = {},
): Promise<CustomerTrackingLookupResult | null> {
  const trackingNumber = normalizeCustomerTrackingNumber(rawTrackingNumber);

  if (!trackingNumber) {
    return null;
  }

  await enforceTrackingLookupRateLimit(options.fetch ?? fetch, {
    clientIp: options.clientIp,
    trackingNumber,
  });

  const supabase = options.supabase ?? createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_customer_orders_by_tracking_number", {
    p_tracking_number: trackingNumber,
  });

  if (error) {
    throw new Error("Unable to look up orders for this tracking number.");
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  return parseTrackingLookupPayload(data);
}

export async function loadCustomerTrackingNumber(
  customerId: string,
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<string> {
  const { data, error } = await supabase
    .from("customer")
    .select("tracking_number")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !data?.tracking_number) {
    throw new Error("Unable to load customer tracking number.");
  }

  return String(data.tracking_number);
}

export async function loadGuestOrderTrackingNumber(
  orderId: string,
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<string> {
  const { data, error } = await supabase
    .from("customer_order")
    .select("customer:customer_id ( tracking_number )")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load guest order tracking number.");
  }

  const customer = data?.customer;

  if (!customer || typeof customer !== "object" || !("tracking_number" in customer)) {
    throw new Error("Unable to load guest order tracking number.");
  }

  const trackingNumber = customer.tracking_number;

  if (typeof trackingNumber !== "string" || trackingNumber.trim() === "") {
    throw new Error("Unable to load guest order tracking number.");
  }

  return trackingNumber;
}

export function formatTrackingOrderStatus(status: string): string {
  return autoCapitalize(status.replaceAll("_", " "));
}

export function formatTrackingLookupDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function formatTrackingCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number.isFinite(value) ? value : 0);
}

export function sumTrackingOrderAmountsDue(orders: CustomerTrackingOrder[]): number {
  return roundTrackingCurrency(
    orders.reduce((total, order) => total + order.amountDue, 0),
  );
}

function roundTrackingCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseTrackingLookupPayload(value: unknown): CustomerTrackingLookupResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as {
    trackingNumber?: unknown;
    totalAmountDue?: unknown;
    orders?: unknown;
  };

  if (typeof payload.trackingNumber !== "string") {
    return null;
  }

  const orders = Array.isArray(payload.orders)
    ? payload.orders.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const order = entry as Record<string, unknown>;

        if (
          typeof order.id !== "string"
          || typeof order.orderStatus !== "string"
          || typeof order.paymentStatus !== "string"
          || typeof order.source !== "string"
          || typeof order.createdAt !== "string"
        ) {
          return [];
        }

        const orderTotal = parseTrackingAmount(order.orderTotal);
        const amountDue = parseTrackingAmount(order.amountDue);

        if (orderTotal === null || amountDue === null) {
          return [];
        }

        return [{
          id: order.id,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          source: order.source,
          createdAt: order.createdAt,
          orderTotal,
          amountDue,
          items: parseTrackingOrderItems(order.items),
        }];
      })
    : [];

  const parsedTotalAmountDue = parseTrackingAmount(payload.totalAmountDue);

  return {
    trackingNumber: payload.trackingNumber,
    totalAmountDue: parsedTotalAmountDue ?? sumTrackingOrderAmountsDue(orders),
    orders,
  };
}

function parseTrackingAmount(value: unknown): number | null {
  const amount = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;

  if (!Number.isFinite(amount)) {
    return null;
  }

  return roundTrackingCurrency(amount);
}

function parseTrackingOrderItems(value: unknown): CustomerTrackingOrderItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const item = entry as Record<string, unknown>;

    if (
      typeof item.productName !== "string"
      || typeof item.unitLabel !== "string"
      || (typeof item.quantity !== "number" && typeof item.quantity !== "string")
    ) {
      return [];
    }

    const quantity = Number(item.quantity);

    if (!Number.isFinite(quantity)) {
      return [];
    }

    return [{
      productName: item.productName,
      quantity,
      unitLabel: item.unitLabel,
      addDetails: typeof item.addDetails === "string" ? item.addDetails : null,
    }];
  });
}

async function enforceTrackingLookupRateLimit(
  fetcher: typeof fetch,
  options: {
    clientIp?: string | null;
    trackingNumber: string;
  },
): Promise<void> {
  const env = getServerEnv();

  if (!env.upstashRedisRestUrl || !env.upstashRedisRestToken) {
    return;
  }

  if (options.clientIp) {
    await enforceRedisCounter(fetcher, env.upstashRedisRestUrl, env.upstashRedisRestToken, {
      key: `customer-tracking:ip-hour:${hashValue(options.clientIp)}`,
      limit: 30,
      message: "Too many tracking lookups were submitted from this network. Please try again later.",
    });
  }

  await enforceRedisCounter(fetcher, env.upstashRedisRestUrl, env.upstashRedisRestToken, {
    key: `customer-tracking:number-hour:${hashValue(options.trackingNumber)}`,
    limit: 20,
    message: "Too many lookups were submitted for this tracking number. Please try again later.",
  });
}

async function enforceRedisCounter(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  options: {
    key: string;
    limit: number;
    message: string;
  },
): Promise<void> {
  const count = await runRedisNumberCommand(fetcher, redisUrl, redisToken, ["incr", options.key]);

  if (count === 1) {
    await runRedisNumberCommand(fetcher, redisUrl, redisToken, ["expire", options.key, "3600"]);
  }

  if (count > options.limit) {
    throw new Error(options.message);
  }
}

async function runRedisNumberCommand(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  parts: string[],
): Promise<number> {
  const result = await runRedisCommand(fetcher, redisUrl, redisToken, parts);

  if (typeof result !== "number") {
    throw new Error("Tracking lookup rate limiting is unavailable.");
  }

  return result;
}

async function runRedisCommand(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  parts: string[],
): Promise<unknown> {
  const url = `${redisUrl.replace(/\/$/, "")}/${parts.map(encodeURIComponent).join("/")}`;
  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${redisToken}`,
    },
  });
  const data = await readJsonResponse(response);

  if (!response.ok || !("result" in data)) {
    throw new Error("Tracking lookup rate limiting is unavailable.");
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
