import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { verifyTurnstileToken } from "@/lib/public-website/turnstile";

const optionalContactEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().toLowerCase().pipe(z.email("Email must be valid when provided.").max(254)).optional(),
);

const optionalContactPhone = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(50, "Phone number must be 50 characters or fewer.").optional(),
);

const contactInquirySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    email: optionalContactEmail,
    phoneNumber: optionalContactPhone,
    message: z.string().trim().min(1, "Message is required.").max(2000),
    turnstileToken: z.string().trim().min(1, "Please complete the verification challenge."),
  })
  .refine((value) => value.email ?? value.phoneNumber, {
    message: "Email or phone number is required.",
    path: ["email"],
  });

export type ContactInquiryPayload = {
  name: string;
  email?: string;
  phoneNumber?: string;
  message: string;
  turnstileToken: string;
};

export type ContactInquiryParseResult =
  | {
      success: true;
      data: ContactInquiryPayload;
    }
  | {
      success: false;
      errors: string[];
    };

export type ContactInquirySubmitOptions = {
  fetch?: typeof fetch;
  clientIp?: string | null;
  userAgent?: string | null;
};

export type ContactInquiryFeedback =
  | {
      status: "submitted";
      reference: string | null;
    }
  | {
      status: "error";
      message: string;
    }
  | null;

export function parseContactInquiryFormData(
  formData: FormData,
): ContactInquiryParseResult {
  const result = contactInquirySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phoneNumber: formData.get("phoneNumber") ?? undefined,
    message: formData.get("message"),
    turnstileToken: formData.get("cf-turnstile-response") ?? "",
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((issue) => issue.message),
    };
  }

  return {
    success: true,
    data: result.data as ContactInquiryPayload,
  };
}

export async function submitContactInquiry(
  payload: ContactInquiryPayload,
  options: ContactInquirySubmitOptions = {},
): Promise<string> {
  const env = getServerEnv();
  const fetcher = options.fetch ?? fetch;

  await verifyTurnstileToken(env.turnstileSecretKey, payload.turnstileToken, {
    fetch: fetcher,
    clientIp: options.clientIp,
  });

  const headers = new Headers({
    Authorization: `Bearer ${env.supabaseServerKey}`,
    apikey: env.supabaseServerKey,
    "Content-Type": "application/json",
  });

  if (options.clientIp) {
    headers.set("x-client-ip", options.clientIp);
  }

  if (options.userAgent) {
    headers.set("x-client-user-agent", options.userAgent);
  }

  const response = await fetcher(`${env.supabaseUrl}/functions/v1/contact-inquiry`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await readJsonResponse(response);

  if (!response.ok || typeof body.id !== "string") {
    throw new Error(typeof body.error === "string" ? body.error : "Unable to submit contact inquiry.");
  }

  return body.id;
}

export function getContactInquiryFeedback(url: URL): ContactInquiryFeedback {
  const status = url.searchParams.get("inquiry");

  if (status === "submitted") {
    return {
      status,
      reference: url.searchParams.get("reference"),
    };
  }

  if (status === "error") {
    return {
      status,
      message: url.searchParams.get("message") ?? "Please check the contact form and try again.",
    };
  }

  return null;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));

  return typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
}
