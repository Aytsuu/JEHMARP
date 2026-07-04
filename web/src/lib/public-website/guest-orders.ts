import { z } from "zod";
import { createHash } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const customerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  phoneNumber: z.string().trim().min(1, "Phone number is required.").max(50),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.email("Email must be valid when provided.").optional()),
  address: z.string().trim().min(1, "Delivery address is required.").max(500),
});

const orderItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Product quantity must be greater than zero."),
  addDetails: z.string().trim().max(500).optional(),
});

export type GuestOrderPayload = {
  customer: z.infer<typeof customerSchema>;
  items: z.infer<typeof orderItemSchema>[];
  turnstileToken: string;
};

export type GuestOrderSubmitOptions = {
  fetch?: typeof fetch;
  clientIp?: string | null;
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
};

export type GuestOrderParseResult =
  | {
      success: true;
      data: GuestOrderPayload;
    }
  | {
      success: false;
      errors: string[];
    };

export function parseGuestOrderFormData(formData: FormData): GuestOrderParseResult {
  const customerResult = customerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  const itemResult = parseOrderItems(formData);
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "").trim();
  const errors = [
    ...(customerResult.success ? [] : flattenZodErrors(customerResult.error)),
    ...itemResult.errors,
    ...(turnstileToken === "" ? ["Please complete the verification challenge."] : []),
  ];

  if (!customerResult.success || itemResult.items.length === 0 || errors.length > 0) {
    return {
      success: false,
      errors: itemResult.items.length === 0
        ? [...errors, "Select at least one product quantity."]
        : errors,
    };
  }

  return {
    success: true,
    data: {
      customer: customerResult.data,
      items: itemResult.items,
      turnstileToken,
    },
  };
}

export async function submitGuestOrder(
  payload: GuestOrderPayload,
  options: GuestOrderSubmitOptions = {},
): Promise<string> {
  const env = getServerEnv();
  const fetcher = options.fetch ?? fetch;

  await verifyTurnstileToken(fetcher, env.turnstileSecretKey, payload.turnstileToken, options.clientIp);
  await enforceGuestOrderRateLimit(fetcher, {
    redisUrl: env.upstashRedisRestUrl,
    redisToken: env.upstashRedisRestToken,
    clientIp: options.clientIp,
    contact: payload.customer.email ?? payload.customer.phoneNumber,
  });

  const supabase = options.supabase ?? createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("submit_guest_order", {
    customer_payload: payload.customer,
    item_payload: payload.items,
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to submit guest order");
  }

  return data;
}

async function verifyTurnstileToken(
  fetcher: typeof fetch,
  secretKey: string | undefined,
  token: string,
  clientIp: string | null | undefined,
): Promise<void> {
  if (!secretKey) {
    throw new Error("Verification is not configured.");
  }

  const body = new FormData();

  body.set("secret", secretKey);
  body.set("response", token);

  if (clientIp) {
    body.set("remoteip", clientIp);
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

async function enforceGuestOrderRateLimit(
  fetcher: typeof fetch,
  options: {
    redisUrl: string | undefined;
    redisToken: string | undefined;
    clientIp: string | null | undefined;
    contact: string | undefined;
  },
): Promise<void> {
  if (!options.redisUrl || !options.redisToken) {
    throw new Error("Order rate limiting is not configured.");
  }

  if (options.clientIp) {
    await enforceRedisCounter(fetcher, options.redisUrl, options.redisToken, {
      key: `guest-order:ip-hour:${hashValue(options.clientIp)}`,
      limit: 5,
      message: "Too many guest orders were submitted from this network. Please try again later.",
    });
  }

  if (options.contact) {
    await enforceRedisCounter(fetcher, options.redisUrl, options.redisToken, {
      key: `guest-order:contact-hour:${hashValue(options.contact.toLowerCase())}`,
      limit: 3,
      message: "Too many guest orders were submitted for this contact. Please try again later.",
    });
  }
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
  const url = `${redisUrl.replace(/\/$/, "")}/${parts.map(encodeURIComponent).join("/")}`;
  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${redisToken}`,
    },
  });
  const data = await readJsonResponse(response);

  if (!response.ok || typeof data.result !== "number") {
    throw new Error("Order rate limiting is unavailable.");
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

function parseOrderItems(formData: FormData) {
  const errors: string[] = [];
  const items = Array.from(formData.entries()).flatMap(([key, rawValue]) => {
    if (!key.startsWith("quantity:")) {
      return [];
    }

    const productId = key.replace("quantity:", "").trim();
    const rawQuantity = String(rawValue ?? "").trim();

    if (rawQuantity === "") {
      return [];
    }

    const quantity = Number(rawQuantity);

    if (!Number.isFinite(quantity)) {
      errors.push("Product quantity must be a number.");
      return [];
    }

    if (quantity < 0) {
      errors.push("Product quantity cannot be negative.");
      return [];
    }

    if (quantity === 0) {
      return [];
    }

    const itemResult = orderItemSchema.safeParse({
      productId,
      quantity,
      addDetails: formData.get(`details:${productId}`) ?? undefined,
    });

    if (!itemResult.success) {
      errors.push(...flattenZodErrors(itemResult.error));
      return [];
    }

    return [itemResult.data];
  });

  return {
    items,
    errors,
  };
}

function flattenZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
